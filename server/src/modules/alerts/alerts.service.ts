import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readObject, storage } from '../../config/storage.js';
import { prisma } from '../../db.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { publish } from '../../realtime/bus.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import { bstYear } from '../../utils/formatDate.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { isAdmin } from '../../utils/roles.js';
import { orgHierarchy, resolveScope } from '../../utils/scope.js';
import { writeAudit } from '../audit/audit.service.js';
import { ALLOWED_TYPES, detectMime } from '../evidence/fileType.js';
import { extractMetadata, sha256 } from '../evidence/metadata.js';
import { scanUpload } from '../evidence/scanner.js';
import { loadVisible } from '../incidents/incidents.service.js';
import { pushToUsers } from '../push/push.service.js';
import { FLASH_PRIORITIES, FLASH_THREATS, VALID_HOURS, type RaiseAlertInput } from './alerts.schema.js';

// Flash Alert (spec #23/#58 extension, 2026-10-15). An officer with the "raise_alert" permission
// warns every officer in the target sectors of an imminent threat, with intelligence and evidence.
// - Recipients are fixed when the alert is raised: every active user whose unit lies in a target
//   sector (HQ-level users always). They get it in real time, by push, and from /alerts/active.
// - Each recipient must acknowledge; delivery and acknowledgement are recorded once (DB trigger).
// - The sender accepts a declaration that a false alert is an offence; the time is stored.
// - The sender or an HQ administrator posts updates, resolves it, or cancels it with a reason.
// - It expires by itself at valid_until (derived state "expired"; nothing changes in the row).
// Updates and attachments are append-only; every step is audited.

type AuthUser = Express.AuthUser;
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4']);

const alertInclude = {
  creator: { select: { id: true, name: true, role: true, scope: true } },
  closer: { select: { name: true } },
  attachments: { orderBy: { id: 'asc' as const } },
  updates: { orderBy: { id: 'asc' as const } },
};

type AlertRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>;
const loadRow = (id: number) => prisma.flashAlert.findUnique({ where: { id }, include: alertInclude });

/** active | expired | resolved | cancelled */
export const stateOf = (a: { status: string; validUntil: Date }) => (a.status === 'active' && a.validUntil <= new Date() ? 'expired' : a.status);

function cleanName(name: string) {
  const base = path.basename(name.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  return (cleaned || 'attachment').slice(0, 255);
}

// ---------------------------------------------------------------------------
// Who receives an alert, who sees it, who manages it
// ---------------------------------------------------------------------------

/** Active users whose unit lies in one of the sectors (all sectors when empty). */
export async function recipientsFor(targetSectors: string[]): Promise<string[]> {
  const [users, org] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, scope: true } }),
    orgHierarchy(),
  ]);
  const everywhere = targetSectors.length === 0;
  const targets = new Set(targetSectors);
  const ids: string[] = [];
  for (const u of users) {
    const s = await resolveScope(u.scope);
    const sector =
      s.level === 'sector' ? s.sector : s.level === 'battalion' ? org.find((r) => r.battalion === s.battalion)?.sector : s.level === 'bop' ? org.find((r) => r.bop === s.bop)?.sector : undefined;
    if (s.level === 'all' || (sector && (everywhere || targets.has(sector)))) ids.push(u.id);
  }
  return ids;
}

/** Recipients, the sender, and anyone holding the admin or audit permission (the record stays reviewable). */
async function access(user: AuthUser, alertId: number) {
  const [recipient, perms] = await Promise.all([
    prisma.flashAlertRecipient.findUnique({ where: { alertId_userId: { alertId, userId: user.id } } }),
    permissionsFor(user.role),
  ]);
  return { recipient, overseer: perms.includes('admin') || perms.includes('audit') };
}

async function loadVisibleAlert(user: AuthUser, alertId: number) {
  const a = await loadRow(alertId);
  if (!a) throw notFound('Alert not found');
  const { recipient, overseer } = await access(user, alertId);
  if (!recipient && a.createdBy !== user.id && !overseer) throw notFound('Alert not found');
  return { a, recipient, overseer };
}

const canManage = (user: AuthUser, a: { createdBy: string }) => a.createdBy === user.id || isAdmin(user.role);

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------
async function counts(alertId: number) {
  const [recipients, delivered, acknowledged] = await Promise.all([
    prisma.flashAlertRecipient.count({ where: { alertId } }),
    prisma.flashAlertRecipient.count({ where: { alertId, deliveredAt: { not: null } } }),
    prisma.flashAlertRecipient.count({ where: { alertId, acknowledgedAt: { not: null } } }),
  ]);
  return { recipients, delivered, acknowledged };
}

async function toDto(a: AlertRow, user: AuthUser, recipient: { deliveredAt: Date | null; acknowledgedAt: Date | null } | null, withRecipients: boolean) {
  const state = stateOf(a);
  const manage = canManage(user, a);
  const dto = {
    id: a.id,
    reference: a.reference,
    title: a.title,
    threatType: a.threatType,
    priority: a.priority,
    subjectName: a.subjectName,
    subjectDescription: a.subjectDescription,
    details: a.details,
    instructions: a.instructions,
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    lastSeenPlace: a.lastSeenPlace,
    lat: a.lat === null ? null : Number(a.lat),
    lng: a.lng === null ? null : Number(a.lng),
    targetSectors: a.targetSectors,
    incidentId: a.incidentId,
    validUntil: a.validUntil.toISOString(),
    state,
    createdAt: a.createdAt.toISOString(),
    declarationAt: a.declarationAt.toISOString(),
    sender: a.creator,
    closedAt: a.closedAt?.toISOString() ?? null,
    closedByName: a.closer?.name ?? null,
    closeNote: a.closeNote,
    attachments: a.attachments.map((f) => ({
      id: f.id,
      name: f.originalName,
      mimeType: f.mimeType,
      size: Number(f.fileSize),
      sha256: f.sha256,
      metadata: f.fileMetadata,
      uploadedAt: f.uploadedAt.toISOString(),
      downloadUrl: `/api/v1/alerts/${a.id}/attachments/${f.id}`,
    })),
    updates: a.updates.map((u) => ({ id: u.id, kind: u.kind, body: u.body, user: u.userName, userId: u.userId, date: u.createdAt.toISOString() })),
    me: { recipient: Boolean(recipient), deliveredAt: recipient?.deliveredAt?.toISOString() ?? null, acknowledgedAt: recipient?.acknowledgedAt?.toISOString() ?? null },
    counts: await counts(a.id),
    canUpdate: manage && state === 'active',
    canClose: manage && (state === 'active' || state === 'expired'),
    recipientList: undefined as undefined | { userId: string; name: string; role: string; scope: string; deliveredAt: string | null; acknowledgedAt: string | null }[],
  };
  if (withRecipients) {
    const rows = await prisma.flashAlertRecipient.findMany({
      where: { alertId: a.id },
      include: { user: { select: { name: true, role: true, scope: true } } },
      orderBy: [{ acknowledgedAt: { sort: 'asc', nulls: 'first' } }, { userId: 'asc' }],
    });
    dto.recipientList = rows.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      role: r.user.role,
      scope: r.user.scope,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
    }));
  }
  return dto;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Alerts this user may see (recipient, sender, or admin/audit permission), newest first. */
export async function listAlerts(user: AuthUser, q: { state: 'active' | 'closed' | 'all'; page: number; pageSize: number }) {
  const perms = await permissionsFor(user.role);
  const overseer = perms.includes('admin') || perms.includes('audit');
  const now = new Date();
  const visible = overseer ? {} : { OR: [{ createdBy: user.id }, { recipients: { some: { userId: user.id } } }] };
  const stateWhere =
    q.state === 'active' ? { status: 'active', validUntil: { gt: now } } : q.state === 'closed' ? { OR: [{ status: { not: 'active' } }, { validUntil: { lte: now } }] } : {};
  const where = { AND: [visible, stateWhere] };
  // Not a batched transaction: the includes would run in parallel on one connection
  const [rows, total] = await Promise.all([
    prisma.flashAlert.findMany({ where, include: alertInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.flashAlert.count({ where }),
  ]);
  const mine = await prisma.flashAlertRecipient.findMany({ where: { userId: user.id, alertId: { in: rows.map((r) => r.id) } } });
  const data = [];
  for (const r of rows) data.push(await toDto(r, user, mine.find((m) => m.alertId === r.id) ?? null, false));
  return { data, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/**
 * The active alerts addressed to this user (and those they sent), for the alert screen. Fetching
 * them records delivery for the ones not yet delivered.
 */
export async function activeAlerts(user: AuthUser) {
  const now = new Date();
  const rows = await prisma.flashAlert.findMany({
    where: { status: 'active', validUntil: { gt: now }, OR: [{ createdBy: user.id }, { recipients: { some: { userId: user.id } } }] },
    include: alertInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (rows.length === 0) return [];
  await prisma.flashAlertRecipient.updateMany({ where: { userId: user.id, alertId: { in: rows.map((r) => r.id) }, deliveredAt: null }, data: { deliveredAt: now } });
  const mine = await prisma.flashAlertRecipient.findMany({ where: { userId: user.id, alertId: { in: rows.map((r) => r.id) } } });
  const out = [];
  for (const r of rows) out.push(await toDto(r, user, mine.find((m) => m.alertId === r.id) ?? null, false));
  return out;
}

export async function getAlert(user: AuthUser, alertId: number) {
  const { a, recipient } = await loadVisibleAlert(user, alertId);
  let rec = recipient;
  if (rec && !rec.deliveredAt) {
    rec = await prisma.flashAlertRecipient.update({ where: { alertId_userId: { alertId, userId: user.id } }, data: { deliveredAt: new Date() } });
  }
  const perms = await permissionsFor(user.role);
  // The sender, HQ administrators and auditors see who has and hasn't acknowledged
  const seeRecipients = a.createdBy === user.id || perms.includes('admin') || perms.includes('audit');
  return toDto(a, user, rec, seeRecipients);
}

/** Choices for the raise form: every sector (an alert may warn units outside the sender's own area). */
export async function alertOptions() {
  const sectors = [...new Set((await orgHierarchy()).map((r) => r.sector))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return { sectors, validHours: [...VALID_HOURS], threatTypes: [...FLASH_THREATS], priorities: [...FLASH_PRIORITIES] };
}

/** How many officers an alert to these sectors would reach (raise form). */
export async function previewRecipients(user: AuthUser, sectors: string[]) {
  await validateSectors(sectors);
  const ids = await recipientsFor(sectors);
  return { recipients: ids.filter((id) => id !== user.id).length };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function validateSectors(sectors: string[]) {
  const known = new Set((await orgHierarchy()).map((r) => r.sector));
  const unknown = sectors.filter((s) => !known.has(s));
  if (unknown.length) throw badRequest(`Unknown sector: ${unknown.join(', ')}`);
}

/** FA-<year>-NNNN from a per-year counter in system_config (same scheme as incident numbers). */
async function allocateReference(tx: Tx) {
  const year = bstYear();
  const key = `alert.next_id.${year}`;
  const rows = await tx.$queryRaw<{ value: string }[]>`
    INSERT INTO system_config (key, value, description, updated_at)
    VALUES (${key}, '2', ${`Next Flash Alert number for ${year}`}, now())
    ON CONFLICT (key) DO UPDATE SET value = (system_config.value::int + 1)::text, updated_at = now()
    RETURNING value`;
  return `FA-${year}-${String(Number(rows[0]!.value) - 1).padStart(4, '0')}`;
}

async function notify(alertId: number, event: 'raised' | 'updated' | 'acknowledged' | 'closed', sender: { id: string; name: string } | null) {
  const a = await prisma.flashAlert.findUnique({ where: { id: alertId }, select: { reference: true, priority: true, createdBy: true, validUntil: true } });
  if (!a) return;
  const recipients = (await prisma.flashAlertRecipient.findMany({ where: { alertId }, select: { userId: true } })).map((r) => r.userId);
  // An acknowledgement only changes the sender's (and overseers') progress view
  const audience = event === 'acknowledged' ? [a.createdBy] : [...new Set([...recipients, a.createdBy])];
  await publish({ type: 'alert', alertId, event, recipients: audience });
  if ((event === 'raised' || event === 'updated') && sender) {
    const ttl = Math.max(60, Math.min(28 * 86_400, Math.round((a.validUntil.getTime() - Date.now()) / 1000)));
    void pushToUsers(
      recipients.filter((id) => id !== sender.id),
      { kind: 'alert', alertId, reference: a.reference, priority: a.priority, senderName: sender.name, event },
      { ttlSeconds: ttl, urgency: 'high', topic: `alert-${alertId}` },
    );
  }
}

export async function raiseAlert(user: AuthUser, input: RaiseAlertInput, files: UploadedFile[], ctx: RequestContext) {
  await validateSectors(input.targetSectors);
  if (input.incidentId) await loadVisible(user, input.incidentId); // 404 unless the sender may see it
  if (input.lastSeenAt && new Date(input.lastSeenAt).getTime() > Date.now() + 5 * 60_000) throw badRequest('"Last seen" cannot be in the future');

  // Check every file before storing anything (same rules as incident evidence)
  const prepared: { name: string; mime: keyof typeof ALLOWED_TYPES; size: number; buffer: Buffer; hash: string; metadata: object; key: string }[] = [];
  for (const file of files) {
    const name = cleanName(file.originalname);
    if (file.size === 0) throw badRequest(`${name} is empty`);
    const mime = detectMime(file.buffer);
    if (!mime) {
      await writeAudit({ action: 'UPLOAD_REJECTED', username: user.username, userId: user.id, details: `Flash Alert attachment "${name}" rejected: content is not an allowed type (declared ${file.mimetype})`, ctx });
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `${name}: only photos (JPEG, PNG, GIF), PDF, video (MP4, MOV) and documents (Word, Excel, PowerPoint, OpenDocument, RTF; no macros) are accepted`);
    }
    const scan = await scanUpload(file.buffer, name);
    if (scan.status === 'infected') {
      await writeAudit({ action: 'UPLOAD_REJECTED', username: user.username, userId: user.id, details: `Flash Alert attachment "${name}" blocked by antivirus (${scan.signature ?? 'unknown'})`, ctx });
      throw new AppError(422, 'MALWARE_DETECTED', `${name} was blocked by the virus scanner`);
    }
    const metadata = await extractMetadata(file.buffer, mime, file.mimetype || null, null);
    prepared.push({ name, mime, size: file.size, buffer: file.buffer, hash: sha256(file.buffer), metadata: { ...metadata, scan }, key: `alerts/${randomUUID()}${ALLOWED_TYPES[mime]}` });
  }

  const recipientIds = (await recipientsFor(input.targetSectors)).filter((id) => id !== user.id);
  if (recipientIds.length === 0) throw badRequest('No active officer serves in the chosen sectors');

  const written: string[] = [];
  let created: { id: number; reference: string };
  try {
    for (const f of prepared) {
      await storage.put(f.key, f.buffer);
      written.push(f.key);
    }
    const now = new Date();
    created = await prisma.$transaction(async (tx) => {
      const reference = await allocateReference(tx);
      const a = await tx.flashAlert.create({
        data: {
          reference,
          title: input.title,
          threatType: input.threatType,
          priority: input.priority,
          subjectName: input.subjectName,
          subjectDescription: input.subjectDescription,
          details: input.details,
          instructions: input.instructions,
          lastSeenAt: input.lastSeenAt ? new Date(input.lastSeenAt) : null,
          lastSeenPlace: input.lastSeenPlace,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          targetSectors: input.targetSectors,
          incidentId: input.incidentId ?? null,
          validUntil: new Date(now.getTime() + input.validHours * 3_600_000),
          declarationAt: now,
          createdBy: user.id,
          createdAt: now,
        },
      });
      for (const f of prepared) {
        await tx.flashAlertAttachment.create({
          data: { alertId: a.id, originalName: f.name, mimeType: f.mime, fileSize: BigInt(f.size), storagePath: f.key, sha256: f.hash, fileMetadata: JSON.parse(JSON.stringify(f.metadata)) },
        });
      }
      await tx.flashAlertRecipient.createMany({ data: recipientIds.map((userId) => ({ alertId: a.id, userId })) });
      return { id: a.id, reference };
    });
  } catch (err) {
    for (const key of written) await storage.remove(key).catch(() => {});
    throw err;
  }

  await writeAudit({
    action: 'RAISE_FLASH_ALERT',
    username: user.username,
    userId: user.id,
    details: `${created.reference} (${input.priority}, ${input.threatType}): ${input.title}. Area: ${input.targetSectors.length ? input.targetSectors.join(', ') : 'all units'}; ${recipientIds.length} recipients; ${prepared.length} attachment(s); valid ${input.validHours} h. False-alert declaration accepted.`,
    ctx,
  });
  await notify(created.id, 'raised', user);
  return getAlert(user, created.id);
}

export async function acknowledgeAlert(user: AuthUser, alertId: number, ctx: RequestContext) {
  const { a, recipient } = await loadVisibleAlert(user, alertId);
  if (!recipient) throw forbidden('This alert was not addressed to you');
  if (!recipient.acknowledgedAt) {
    const now = new Date();
    await prisma.flashAlertRecipient.update({ where: { alertId_userId: { alertId, userId: user.id } }, data: { acknowledgedAt: now, ...(recipient.deliveredAt ? {} : { deliveredAt: now }) } });
    await writeAudit({ action: 'ACKNOWLEDGE_FLASH_ALERT', username: user.username, userId: user.id, details: `${a.reference}: ${a.title}`, ctx });
    await notify(alertId, 'acknowledged', null);
  }
  return getAlert(user, alertId);
}

export async function postUpdate(user: AuthUser, alertId: number, body: string, ctx: RequestContext) {
  const { a } = await loadVisibleAlert(user, alertId);
  if (!canManage(user, a)) {
    await writeAudit({ action: 'DENIED_FLASH_ALERT', username: user.username, userId: user.id, details: `Update to ${a.reference} by someone other than the sender or an HQ administrator`, ctx });
    throw forbidden('Only the sender or an HQ administrator can update this alert');
  }
  if (stateOf(a) !== 'active') throw new AppError(409, 'INVALID_STATE', `${a.reference} is ${stateOf(a)}`);
  await prisma.flashAlertUpdate.create({ data: { alertId, userId: user.id, userName: user.name, kind: 'update', body } });
  await writeAudit({ action: 'UPDATE_FLASH_ALERT', username: user.username, userId: user.id, details: `${a.reference}: ${body.length > 300 ? `${body.slice(0, 300)}…` : body}`, ctx });
  await notify(alertId, 'updated', user);
  return getAlert(user, alertId);
}

/** Resolve (the threat is dealt with) or cancel (withdrawn, e.g. raised in error); a note is required. */
export async function closeAlert(user: AuthUser, alertId: number, kind: 'resolved' | 'cancelled', notes: string, ctx: RequestContext) {
  const { a } = await loadVisibleAlert(user, alertId);
  if (!canManage(user, a)) {
    await writeAudit({ action: 'DENIED_FLASH_ALERT', username: user.username, userId: user.id, details: `${kind === 'resolved' ? 'Resolve' : 'Cancel'} ${a.reference} by someone other than the sender or an HQ administrator`, ctx });
    throw forbidden('Only the sender or an HQ administrator can close this alert');
  }
  if (a.status !== 'active') throw new AppError(409, 'INVALID_STATE', `${a.reference} is already ${a.status}`);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.flashAlert.updateMany({ where: { id: alertId, status: 'active' }, data: { status: kind, closedBy: user.id, closedAt: now, closeNote: notes } });
    if (count === 0) throw new AppError(409, 'INVALID_STATE', `${a.reference} changed state; reload and try again`);
    await tx.flashAlertUpdate.create({ data: { alertId, userId: user.id, userName: user.name, kind, body: notes } });
  });
  await writeAudit({ action: kind === 'resolved' ? 'RESOLVE_FLASH_ALERT' : 'CANCEL_FLASH_ALERT', username: user.username, userId: user.id, details: `${a.reference}: ${notes}`, ctx });
  await notify(alertId, 'closed', user);
  return getAlert(user, alertId);
}

/** An attachment, integrity-checked; viewing is audited like evidence. */
export async function openAttachment(user: AuthUser, alertId: number, attachmentId: number, inline: boolean, ctx: RequestContext) {
  const { a } = await loadVisibleAlert(user, alertId);
  const f = a.attachments.find((x) => x.id === attachmentId);
  if (!f) throw notFound('Attachment not found');
  let object;
  try {
    object = await readObject(f.storagePath);
  } catch {
    object = undefined;
  }
  if (object === null) throw new AppError(404, 'FILE_UNAVAILABLE', 'The file is not in storage');
  if (!object || sha256(object.data) !== f.sha256) {
    await writeAudit({ action: 'EVIDENCE_INTEGRITY_FAILURE', username: user.username, userId: user.id, details: `${a.reference} attachment #${f.id} "${f.originalName}": HASH MISMATCH`, ctx });
    throw new AppError(409, 'EVIDENCE_TAMPERED', 'This file failed its integrity check');
  }
  await writeAudit({ action: 'VIEW_ALERT_ATTACHMENT', username: user.username, userId: user.id, details: `${a.reference}: ${f.originalName} (#${f.id})`, ctx });
  return { name: f.originalName, mimeType: f.mimeType, data: object.data, sha256: f.sha256, inline: inline && INLINE_TYPES.has(f.mimeType) };
}
