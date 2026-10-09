import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { readObject, storage, storageEncrypted } from '../../config/storage.js';
import { prisma } from '../../db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { isAdmin } from '../../utils/roles.js';
import { writeAudit } from '../audit/audit.service.js';
import { loadVisible } from '../incidents/incidents.service.js';
import { isEditableStatus } from '../incidents/workflow.js';
import { toEvidenceDto } from './evidence.dto.js';
import { ALLOWED_TYPES, detectMime, type AllowedMime } from './fileType.js';
import { extractMetadata, sha256, type EvidenceMetadata } from './metadata.js';
import { scanUpload, type ScanResult } from './scanner.js';

type AuthUser = Express.AuthUser;

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MB = 1024 * 1024;

interface PreparedFile {
  name: string;
  mime: AllowedMime;
  size: number;
  buffer: Buffer;
  hash: string;
  key: string;
  metadata: EvidenceMetadata & { scan: ScanResult };
}

/** Keeps the user's file name for display, minus paths and control characters. Bangla etc. is kept. */
function cleanName(name: string) {
  const base = path.basename(name.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  return (cleaned || 'evidence').slice(0, 255);
}

// ---------------------------------------------------------------------------
// Upload (specs #10, #11) — creator only, while the incident is Draft or Returned
// ---------------------------------------------------------------------------
export async function uploadEvidence(
  user: AuthUser,
  incidentId: string,
  files: UploadedFile[],
  clientLastModified: (string | null)[],
  ctx: RequestContext,
) {
  if (files.length === 0) throw badRequest('No files uploaded (form field "files")');

  const inc = await loadVisible(user, incidentId);
  if (inc.createdBy !== user.id || !isEditableStatus(inc.status)) {
    await writeAudit({
      action: 'DENIED_UPDATE',
      username: user.username,
      userId: user.id,
      details: `Blocked evidence upload to ${incidentId} (status ${inc.status}${inc.createdBy !== user.id ? ', not creator' : ''})`,
      ctx,
    });
    throw forbidden('Evidence can only be added by the officer who filed the incident, while it is Draft or Returned');
  }

  // Validate everything before writing anything
  const prepared: PreparedFile[] = [];
  for (const [i, file] of files.entries()) {
    const name = cleanName(file.originalname);
    if (file.size === 0) throw badRequest(`${name} is empty`);
    const mime = detectMime(file.buffer);
    if (!mime) {
      await writeAudit({
        action: 'UPLOAD_REJECTED',
        username: user.username,
        userId: user.id,
        details: `${incidentId}: "${name}" rejected — content is not an allowed type (declared ${file.mimetype})`,
        ctx,
      });
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `${name}: only JPEG, PNG, GIF, PDF, MP4 and MOV files are accepted`);
    }
    const scan = await scanUpload(file.buffer, name);
    if (scan.status === 'infected') {
      await writeAudit({
        action: 'UPLOAD_REJECTED',
        username: user.username,
        userId: user.id,
        details: `${incidentId}: "${name}" blocked by antivirus (${scan.signature ?? 'unknown'})`,
        ctx,
      });
      throw new AppError(422, 'MALWARE_DETECTED', `${name} was blocked by the virus scanner`);
    }
    const metadata = await extractMetadata(file.buffer, mime, file.mimetype || null, clientLastModified[i] ?? null);
    prepared.push({
      name,
      mime,
      size: file.size,
      buffer: file.buffer,
      hash: sha256(file.buffer),
      key: `incidents/${incidentId}/${randomUUID()}${ALLOWED_TYPES[mime]}`,
      metadata: { ...metadata, scan },
    });
  }

  // Per-incident storage quota (§21)
  const existing = await prisma.evidence.aggregate({ where: { incidentId, deletedAt: null }, _sum: { fileSize: true } });
  const used = Number(existing._sum.fileSize ?? 0n);
  const incoming = prepared.reduce((n, f) => n + f.size, 0);
  if (used + incoming > env.EVIDENCE_MAX_INCIDENT_MB * MB) {
    throw new AppError(413, 'QUOTA_EXCEEDED', `Evidence for one incident is limited to ${env.EVIDENCE_MAX_INCIDENT_MB} MB`);
  }

  // Store files, then record them; if the DB write fails, remove what was stored
  const written: string[] = [];
  try {
    for (const f of prepared) {
      await storage.put(f.key, f.buffer);
      written.push(f.key);
    }
    const rows = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const f of prepared) {
        created.push(
          await tx.evidence.create({
            data: {
              incidentId,
              fileName: path.posix.basename(f.key),
              originalName: f.name,
              mimeType: f.mime,
              fileSize: BigInt(f.size),
              storagePath: f.key,
              sha256: f.hash,
              fileMetadata: JSON.parse(JSON.stringify(f.metadata)),
              uploadedBy: user.id,
            },
          }),
        );
      }
      await tx.incidentTimeline.create({
        data: {
          incidentId,
          action: 'Evidence added',
          userName: user.name,
          userId: user.id,
          status: inc.status,
          notes: prepared.map((f) => f.name).join(', ').slice(0, 2000),
        },
      });
      return created;
    });

    await writeAudit({
      action: 'UPLOAD_EVIDENCE',
      username: user.username,
      userId: user.id,
      details: `${incidentId}: ${prepared.map((f) => `${f.name} (${f.mime}, ${f.size} B, sha256 ${f.hash.slice(0, 16)}…)`).join('; ')}`.slice(0, 4000),
      ctx,
    });
    return rows.map(toEvidenceDto);
  } catch (err) {
    await Promise.all(written.map((k) => storage.remove(k).catch((e) => logger.error('Evidence rollback failed', { key: k, e }))));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function listEvidence(user: AuthUser, incidentId: string) {
  const inc = await loadVisible(user, incidentId);
  return inc.evidence.map(toEvidenceDto);
}

async function loadEvidence(user: AuthUser, incidentId: string, evidenceId: number) {
  const inc = await loadVisible(user, incidentId); // scope + draft visibility
  const ev = await prisma.evidence.findFirst({ where: { id: evidenceId, incidentId, deletedAt: null } });
  if (!ev) throw notFound('Evidence not found');
  return { inc, ev };
}

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4']);

// Images and videos are shown automatically on the incident page, so every page open fetches them.
// A repeat view of the same file by the same user within this window is not logged again (the first
// view always is; downloads always are). Per process, like the audit-trail view de-duplication.
const VIEW_DEDUPE_MS = 10 * 60_000;
const lastView = new Map<string, number>();
function isRepeatView(userId: string, evidenceId: number) {
  const now = Date.now();
  if (lastView.size > 10_000) for (const [k, at] of lastView) if (now - at >= VIEW_DEDUPE_MS) lastView.delete(k);
  const key = `${userId}:${evidenceId}`;
  const prev = lastView.get(key);
  if (prev !== undefined && now - prev < VIEW_DEDUPE_MS) return true;
  lastView.set(key, now);
  return false;
}

export async function openEvidence(user: AuthUser, incidentId: string, evidenceId: number, inline: boolean, ctx: RequestContext) {
  const { ev } = await loadEvidence(user, incidentId, evidenceId);
  let object: Awaited<ReturnType<typeof readObject>> = null;
  let tampered = false;
  try {
    object = await readObject(ev.storagePath);
    // With encryption on, a plaintext object is accepted only as a pre-encryption file whose
    // content still matches its upload hash; otherwise it may have been swapped in on disk.
    if (object && storageEncrypted && !object.encrypted && ev.sha256 && sha256(object.data) !== ev.sha256) tampered = true;
  } catch {
    tampered = true; // encrypted object failed authentication
  }
  if (tampered) {
    await writeAudit({
      action: 'EVIDENCE_INTEGRITY_FAILURE',
      username: user.username,
      userId: user.id,
      details: `${incidentId}: ${ev.originalName} (#${ev.id}) failed its integrity check on download; not served`,
      ctx,
    });
    throw new AppError(409, 'EVIDENCE_TAMPERED', 'This evidence file failed its integrity check and cannot be downloaded');
  }
  if (!object) throw new AppError(404, 'FILE_UNAVAILABLE', 'The file for this evidence record is not in storage');
  const stream = Readable.from(object.data);
  // Spec #24 — an in-browser preview is recorded as a view, a saved copy as a download
  const shownInline = inline && INLINE_TYPES.has(ev.mimeType);

  if (!(shownInline && isRepeatView(user.id, ev.id))) {
    await writeAudit({
      action: shownInline ? 'VIEW_EVIDENCE' : 'DOWNLOAD_EVIDENCE',
      username: user.username,
      userId: user.id,
      details: `${incidentId}: ${ev.originalName} (#${ev.id})`,
      ctx,
    });
  }
  return {
    stream,
    name: ev.originalName,
    mimeType: ev.mimeType,
    size: Number(ev.fileSize),
    sha256: ev.sha256,
    inline: shownInline,
  };
}

/** Chain of custody: recompute the stored file's SHA-256 and compare with the upload-time hash. */
export async function verifyEvidence(user: AuthUser, incidentId: string, evidenceId: number, ctx: RequestContext) {
  const { ev } = await loadEvidence(user, incidentId, evidenceId);
  let data: Buffer | null;
  let tampered = false;
  try {
    data = (await readObject(ev.storagePath))?.data ?? null;
  } catch {
    data = null; // encrypted file failed authentication (altered on disk)
    tampered = true;
  }
  const actual = data ? sha256(data) : null;
  const intact = !!data && actual === ev.sha256 && data.length === Number(ev.fileSize);

  await writeAudit({
    action: intact ? 'VERIFY_EVIDENCE' : 'EVIDENCE_INTEGRITY_FAILURE',
    username: user.username,
    userId: user.id,
    details: `${incidentId}: ${ev.originalName} (#${ev.id}) ${intact ? 'hash verified' : tampered ? 'DECRYPTION FAILED (tampered)' : data ? 'HASH MISMATCH' : 'file missing'}`,
    ctx,
  });
  return { id: ev.id, name: ev.originalName, intact, fileFound: !!data || tampered, expectedSha256: ev.sha256, actualSha256: actual };
}

// ---------------------------------------------------------------------------
// Soft delete (§19.4). The creator may remove a file while editing; HQ admins may remove
// at any stage but must give a reason. The stored file is kept for the retention policy.
// ---------------------------------------------------------------------------
export async function removeEvidence(user: AuthUser, incidentId: string, evidenceId: number, reason: string | undefined, ctx: RequestContext) {
  const { inc, ev } = await loadEvidence(user, incidentId, evidenceId);
  const creatorEditing = inc.createdBy === user.id && isEditableStatus(inc.status);
  if (!creatorEditing && !isAdmin(user.role)) {
    await writeAudit({ action: 'DENIED_UPDATE', username: user.username, userId: user.id, details: `Blocked removal of evidence #${ev.id} on ${incidentId}`, ctx });
    throw forbidden('You cannot remove this evidence');
  }
  if (!creatorEditing && !reason) throw badRequest('A reason is required to remove evidence from a submitted incident');

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.evidence.updateMany({ where: { id: ev.id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count === 0) throw notFound('Evidence not found');
    await tx.incidentTimeline.create({
      data: {
        incidentId,
        action: 'Evidence removed',
        userName: user.name,
        userId: user.id,
        status: inc.status,
        notes: `${ev.originalName}${reason ? ` — ${reason}` : ''}`.slice(0, 2000),
      },
    });
  });
  await writeAudit({
    action: 'DELETE_EVIDENCE',
    username: user.username,
    userId: user.id,
    details: `${incidentId}: ${ev.originalName} (#${ev.id}, sha256 ${ev.sha256 ?? 'n/a'})${reason ? ` — ${reason}` : ''}`,
    ctx,
  });
}
