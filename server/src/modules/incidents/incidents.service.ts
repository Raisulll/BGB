import { prisma } from '../../db.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import { bstYear, fromDateString, fromTimeString, toDateString, toTimeString } from '../../utils/formatDate.js';
import { paged, toSkipTake } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { inScope, isValidLocation, resolveScope, scopeWhere, type ScopeFilter } from '../../utils/scope.js';
import { writeAudit } from '../audit/audit.service.js';
import { toEvidenceDto } from '../evidence/evidence.dto.js';
import { notifyComment, notifyWorkflow, type WorkflowEvent } from '../notifications/notifications.service.js';
import type { CreateIncidentInput, ListIncidentsQuery, UpdateIncidentInput } from './incidents.schema.js';
import { isAdmin } from '../../utils/roles.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { CONFIG_DEFAULTS } from '../admin/config.service.js';
import { actionableStatuses, availableActions, EDITABLE_STATUSES, isArchivableStatus, isEditableStatus, OVERDUE_STATUSES, WORKFLOW, type WorkflowAction } from './workflow.js';

type AuthUser = Express.AuthUser;

const conflict = (message: string) => new AppError(409, 'INVALID_STATE', message);

const detailInclude = {
  creator: { select: { name: true } },
  timeline: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  evidence: { where: { deletedAt: null }, orderBy: { uploadedAt: 'asc' } },
  comments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.IncidentInclude;

// ---------------------------------------------------------------------------
// Overdue: waiting longer than `workflow.overdue_days` in one workflow step (spec #47 setting)
// ---------------------------------------------------------------------------
export async function overdueCutoff(): Promise<Date> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'workflow.overdue_days' } });
  const days = Number(row?.value ?? CONFIG_DEFAULTS['workflow.overdue_days']!.value);
  return new Date(Date.now() - (Number.isFinite(days) ? days : 3) * 86_400_000);
}

const isOverdue = (inc: { status: string; archivedAt: Date | null; statusChangedAt: Date }, cutoff: Date) =>
  inc.archivedAt === null && (OVERDUE_STATUSES as readonly string[]).includes(inc.status) && inc.statusChangedAt < cutoff;

/** Who may comment: anyone who files incidents or takes part in review/approval (not read-only roles). */
async function mayComment(user: AuthUser, inc: { status: string; archivedAt: Date | null }) {
  if (inc.status === 'Draft' || inc.archivedAt !== null) return false;
  return actionableStatuses(user.role).length > 0 || (await permissionsFor(user.role)).includes('create');
}

type IncidentRow = Prisma.IncidentGetPayload<{ include: { creator: { select: { name: true } } } }>;
type IncidentDetailRow = Prisma.IncidentGetPayload<{ include: typeof detailInclude }>;

// ---------------------------------------------------------------------------
// Visibility: inside the user's scope, drafts only to their creator (DOUBT-008), and never a
// discarded draft (kept only because timeline rows are append-only)
// ---------------------------------------------------------------------------
function visibilityWhere(user: AuthUser, scope: ScopeFilter): Prisma.IncidentWhereInput {
  return { AND: [scopeWhere(scope), { discardedAt: null }, { OR: [{ status: { not: 'Draft' } }, { createdBy: user.id }] }] };
}

function canSee(
  user: AuthUser,
  scope: ScopeFilter,
  inc: { status: string; createdBy: string; discardedAt: Date | null; sector: string | null; battalion: string | null; bop: string | null },
) {
  return inScope(scope, inc) && inc.discardedAt === null && (inc.status !== 'Draft' || inc.createdBy === user.id);
}

/** Loads an incident the user may see; anything else is a 404 so existence isn't leaked. */
export async function loadVisible(user: AuthUser, id: string) {
  const inc = await prisma.incident.findUnique({ where: { id }, include: detailInclude });
  if (!inc || !canSee(user, await resolveScope(user.scope), inc)) throw notFound('Incident not found');
  return inc;
}

// ---------------------------------------------------------------------------
// DTOs — field names match the frontend incident model (CLAUDE.md §7)
// ---------------------------------------------------------------------------
function permittedActions(user: AuthUser, inc: { status: string; createdBy: string; archivedAt: Date | null }) {
  const own = inc.createdBy === user.id;
  const archived = inc.archivedAt !== null;
  return {
    // Separation of duties: nobody moves their own report through review/approval
    actions: own || archived ? [] : availableActions(inc.status, user.role),
    canEdit: own && !archived && isEditableStatus(inc.status),
    canSubmit: own && !archived && isEditableStatus(inc.status),
    // A never-submitted draft can be discarded by its creator; anything filed stays on record
    canDiscard: own && !archived && inc.status === 'Draft',
    // Spec #45 — HQ administrators archive final records and can restore them
    canArchive: isAdmin(user.role) && !archived && isArchivableStatus(inc.status),
    canRestore: isAdmin(user.role) && archived,
  };
}

function toSummaryDto(inc: IncidentRow, user: AuthUser, cutoff: Date) {
  return {
    id: inc.id,
    title: inc.title,
    category: inc.category,
    subcategory: inc.subcategory,
    severity: inc.severity,
    status: inc.status,
    date: toDateString(inc.incidentDate),
    time: toTimeString(inc.incidentTime),
    location: inc.location,
    sector: inc.sector,
    battalion: inc.battalion,
    bop: inc.bop,
    lat: inc.lat === null ? null : Number(inc.lat),
    lng: inc.lng === null ? null : Number(inc.lng),
    createdBy: inc.createdBy,
    createdByName: inc.creator.name,
    createdAt: inc.createdAt.toISOString(),
    updatedAt: inc.updatedAt.toISOString(),
    archivedAt: inc.archivedAt?.toISOString() ?? null,
    statusChangedAt: inc.statusChangedAt.toISOString(),
    overdue: isOverdue(inc, cutoff),
    ...permittedActions(user, inc),
  };
}

function toDetailDto(inc: IncidentDetailRow, user: AuthUser, cutoff: Date, canComment: boolean) {
  return {
    ...toSummaryDto(inc, user, cutoff),
    description: inc.description,
    personsInvolved: inc.personsInvolved,
    actionTaken: inc.actionTaken,
    outcome: inc.outcome,
    timeline: inc.timeline.map(toTimelineDto),
    evidence: inc.evidence.map(toEvidenceDto),
    comments: inc.comments.map((c) => ({ id: c.id, user: c.userName, userId: c.userId, body: c.body, date: c.createdAt.toISOString() })),
    canComment,
  };
}

const toTimelineDto = (t: IncidentDetailRow['timeline'][number]) => ({
  action: t.action,
  user: t.userName,
  userId: t.userId,
  status: t.status,
  notes: t.notes,
  date: t.createdAt.toISOString(),
});

// ---------------------------------------------------------------------------
// Validation shared by create + update
// ---------------------------------------------------------------------------
async function validateClassification(category: string, subcategory: string | null | undefined) {
  const cat = await prisma.incidentCategory.findFirst({
    where: { name: category, isActive: true },
    include: { subcategories: { where: { isActive: true }, select: { name: true } } },
  });
  if (!cat) throw badRequest(`Unknown or inactive category "${category}"`);
  if (subcategory && !cat.subcategories.some((s) => s.name === subcategory)) {
    throw badRequest(`"${subcategory}" is not a subcategory of ${category}`);
  }
}

async function validateLocation(user: AuthUser, scope: ScopeFilter, loc: { sector: string; battalion: string; bop: string }) {
  if (!(await isValidLocation(loc.sector, loc.battalion, loc.bop))) {
    throw badRequest(`${loc.bop} / ${loc.battalion} / ${loc.sector} is not a valid BOP / battalion / sector combination`);
  }
  if (!inScope(scope, loc)) throw forbidden(`You can only file incidents within your unit (${user.scope})`);
}

function validateDate(date: string) {
  // Allow "today" in any timezone around BST; reject incidents dated in the future
  const tomorrow = new Date(Date.now() + 30 * 3_600_000).toISOString().slice(0, 10);
  if (date > tomorrow) throw badRequest('Incident date cannot be in the future');
}

/** BIRDS-<year>-NNNN, per-year sequence allocated atomically in system_config (spec #15, DOUBT-006). */
async function allocateIncidentId(tx: Prisma.TransactionClient) {
  const year = bstYear();
  const key = `incident.next_id.${year}`;
  const rows = await tx.$queryRaw<{ value: string }[]>`
    INSERT INTO system_config (key, value, description, updated_at)
    VALUES (${key}, '1002', ${`Next incident reference number for ${year}`}, now())
    ON CONFLICT (key) DO UPDATE SET value = (system_config.value::int + 1)::text, updated_at = now()
    RETURNING value`;
  const seq = Number(rows[0]!.value) - 1;
  return `BIRDS-${year}-${String(seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export type IncidentFilters = Omit<ListIncidentsQuery, 'page' | 'pageSize' | 'sort' | 'order'>;

/**
 * Visibility (scope + draft privacy) plus the search filters, shared by the list endpoint,
 * the GIS endpoint and the reports module so every view of the data obeys the same rules.
 * `submittedOnly` drops drafts entirely (analytics and reports cover filed incidents only).
 */
export async function incidentWhere(
  user: AuthUser,
  q: IncidentFilters,
  submittedOnly = false,
  archivedDefault: 'exclude' | 'include' = 'exclude',
): Promise<Prisma.IncidentWhereInput> {
  const scope = await resolveScope(user.scope);
  const filters: Prisma.IncidentWhereInput[] = [visibilityWhere(user, scope)];
  if (submittedOnly) filters.push({ status: { not: 'Draft' } });
  const archived = q.archived ?? archivedDefault;
  if (archived === 'exclude') filters.push({ archivedAt: null });
  if (archived === 'only') filters.push({ archivedAt: { not: null } });

  if (q.q) {
    filters.push({
      OR: [
        { id: { contains: q.q, mode: 'insensitive' } },
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
        { location: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }
  if (q.status?.length) filters.push({ status: { in: q.status } });
  if (q.severity?.length) filters.push({ severity: { in: q.severity } });
  if (q.category) filters.push({ category: q.category });
  if (q.sector) filters.push({ sector: q.sector });
  if (q.battalion) filters.push({ battalion: q.battalion });
  if (q.bop) filters.push({ bop: q.bop });
  if (q.dateFrom) filters.push({ incidentDate: { gte: fromDateString(q.dateFrom) } });
  if (q.dateTo) filters.push({ incidentDate: { lte: fromDateString(q.dateTo) } });
  if (q.createdBy) filters.push({ createdBy: q.createdBy === 'me' ? user.id : q.createdBy });
  // Waiting longer than workflow.overdue_days in one step
  if (q.overdue) {
    filters.push({ archivedAt: null, status: { in: [...OVERDUE_STATUSES] }, statusChangedAt: { lt: await overdueCutoff() } });
  }
  // "Needs my action": records this user can move on now (WORKFLOW table, separation of duties),
  // plus their own returned reports waiting for corrections
  if (q.needsAction) {
    filters.push({ archivedAt: null });
    filters.push({
      OR: [
        { status: { in: actionableStatuses(user.role) }, createdBy: { not: user.id } },
        { status: 'Returned', createdBy: user.id },
      ],
    });
  }
  return { AND: filters };
}

export async function listIncidents(user: AuthUser, q: ListIncidentsQuery) {
  const [where, cutoff] = await Promise.all([incidentWhere(user, q), overdueCutoff()]);
  const sortField = q.sort === 'incidentDate' ? 'incidentDate' : q.sort === 'id' ? 'id' : 'createdAt';
  const [rows, total] = await prisma.$transaction([
    prisma.incident.findMany({
      where,
      include: { creator: { select: { name: true } } },
      orderBy: [{ [sortField]: q.order }, { id: q.order }],
      ...toSkipTake(q),
    }),
    prisma.incident.count({ where }),
  ]);
  return paged(
    rows.map((r) => toSummaryDto(r, user, cutoff)),
    total,
    q,
  );
}

// ---------------------------------------------------------------------------
// Same place, around the same time: related incidents (detail page) and the duplicate check
// (incident form). Only incidents the user may see are considered.
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface NearbyQuery {
  date: string; // YYYY-MM-DD
  lat?: number | null;
  lng?: number | null;
  bop?: string | null;
  category?: string | null;
  excludeId?: string;
}

async function nearby(user: AuthUser, q: NearbyQuery, windowDays: number, matches: (m: { daysApart: number; km: number | null; sameBop: boolean; sameCategory: boolean }) => boolean, limit: number) {
  const scope = await resolveScope(user.scope);
  const day = fromDateString(q.date).getTime();
  const [rows, cutoff] = await Promise.all([
    prisma.incident.findMany({
      where: {
        AND: [
          visibilityWhere(user, scope),
          { incidentDate: { gte: new Date(day - windowDays * DAY_MS), lte: new Date(day + windowDays * DAY_MS) } },
          ...(q.excludeId ? [{ id: { not: q.excludeId } }] : []),
        ],
      },
      include: { creator: { select: { name: true } } },
      take: 2000,
    }),
    overdueCutoff(),
  ]);
  const hasGps = q.lat != null && q.lng != null;
  return rows
    .map((r) => {
      const km = hasGps && r.lat !== null && r.lng !== null ? distanceKm(q.lat!, q.lng!, Number(r.lat), Number(r.lng)) : null;
      const m = {
        daysApart: Math.round(Math.abs(r.incidentDate.getTime() - day) / DAY_MS),
        km,
        sameBop: Boolean(q.bop) && r.bop === q.bop,
        sameCategory: Boolean(q.category) && r.category === q.category,
      };
      return { r, m };
    })
    .filter(({ m }) => matches(m))
    .sort((a, b) => a.m.daysApart - b.m.daysApart || (a.m.km ?? Infinity) - (b.m.km ?? Infinity))
    .slice(0, limit)
    .map(({ r, m }) => ({
      ...toSummaryDto(r, user, cutoff),
      match: { daysApart: m.daysApart, distanceKm: m.km === null ? null : Math.round(m.km * 10) / 10, sameBop: m.sameBop, sameCategory: m.sameCategory },
    }));
}

/** Incidents at the same BOP or within 5 km, within 30 days either side (closest in time first). */
export async function relatedIncidents(user: AuthUser, id: string) {
  const inc = await loadVisible(user, id);
  const q: NearbyQuery = {
    date: toDateString(inc.incidentDate),
    lat: inc.lat === null ? null : Number(inc.lat),
    lng: inc.lng === null ? null : Number(inc.lng),
    bop: inc.bop,
    category: inc.category,
    excludeId: id,
  };
  return nearby(user, q, 30, (m) => m.sameBop || (m.km !== null && m.km <= 5), 8);
}

/**
 * Possible duplicates of a report being filed: within a day, and within 1 km, or at the same BOP
 * in the same category. Advisory only: the form shows them, filing is never blocked.
 */
export async function similarIncidents(user: AuthUser, q: NearbyQuery) {
  return nearby(user, q, 1, (m) => m.daysApart <= 1 && ((m.km !== null && m.km <= 1) || (m.sameBop && m.sameCategory)), 5);
}

export async function getIncident(user: AuthUser, id: string) {
  const [inc, cutoff] = await Promise.all([loadVisible(user, id), overdueCutoff()]);
  return toDetailDto(inc, user, cutoff, await mayComment(user, inc));
}

export async function getTimeline(user: AuthUser, id: string) {
  return (await loadVisible(user, id)).timeline.map(toTimelineDto);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
export async function createIncident(user: AuthUser, input: CreateIncidentInput, ctx: RequestContext) {
  const scope = await resolveScope(user.scope);
  await validateClassification(input.category, input.subcategory);
  await validateLocation(user, scope, input);
  validateDate(input.date);

  const { status, date, time, ...fields } = input;
  const id = await prisma.$transaction(async (tx) => {
    const newId = await allocateIncidentId(tx);
    const created = await tx.incident.create({
      data: {
        ...fields,
        id: newId,
        status,
        incidentDate: fromDateString(date),
        incidentTime: fromTimeString(time),
        lat: fields.lat ?? null,
        lng: fields.lng ?? null,
        createdBy: user.id,
        timeline: {
          create: [
            { action: 'Created', userName: user.name, userId: user.id, status: 'Draft' },
            ...(status === 'Submitted' ? [{ action: 'Submitted', userName: user.name, userId: user.id, status: 'Submitted' }] : []),
          ],
        },
      },
    });
    if (status === 'Submitted') await notifyWorkflow(tx, created, 'submitted', user);
    return newId;
  });

  await writeAudit({
    action: 'CREATE_INCIDENT',
    username: user.username,
    userId: user.id,
    details: `${status === 'Draft' ? 'Draft saved' : 'Submitted'}: ${id} (${input.title})`,
    ctx,
  });
  return getIncident(user, id);
}

async function denied(user: AuthUser, action: string, id: string, reason: string, ctx: RequestContext) {
  await writeAudit({ action, username: user.username, userId: user.id, details: `Blocked on ${id}: ${reason}`, ctx });
}

export async function updateIncident(user: AuthUser, id: string, input: UpdateIncidentInput, ctx: RequestContext) {
  const inc = await loadVisible(user, id);
  if (inc.createdBy !== user.id) {
    await denied(user, 'DENIED_UPDATE', id, 'not the creator', ctx);
    throw forbidden('Only the officer who filed this incident can edit it');
  }
  if (!isEditableStatus(inc.status)) {
    await denied(user, 'DENIED_UPDATE', id, `status is ${inc.status}`, ctx);
    throw forbidden(`${id} is ${inc.status} and can no longer be edited`);
  }
  if (Object.keys(input).length === 0) throw badRequest('No changes supplied');

  const scope = await resolveScope(user.scope);
  const merged = {
    category: input.category ?? inc.category,
    subcategory: input.subcategory !== undefined ? input.subcategory : inc.subcategory,
    sector: input.sector ?? inc.sector ?? '',
    battalion: input.battalion ?? inc.battalion ?? '',
    bop: input.bop ?? inc.bop ?? '',
  };
  if (input.category !== undefined || input.subcategory !== undefined) await validateClassification(merged.category, merged.subcategory);
  if (input.sector !== undefined || input.battalion !== undefined || input.bop !== undefined) await validateLocation(user, scope, merged);
  if (input.date) validateDate(input.date);

  const { date, time, ...fields } = input;
  const changed = Object.keys(input).sort().join(', ');
  await prisma.$transaction(async (tx) => {
    // Conditional on status so a concurrent workflow action can't be overwritten
    const { count } = await tx.incident.updateMany({
      where: { id, status: { in: [...EDITABLE_STATUSES] } },
      data: {
        ...fields,
        ...(date ? { incidentDate: fromDateString(date) } : {}),
        ...(time ? { incidentTime: fromTimeString(time) } : {}),
      },
    });
    if (count === 0) throw conflict(`${id} changed state while you were editing; reload and try again`);
    await tx.incidentTimeline.create({
      data: { incidentId: id, action: 'Edited', userName: user.name, userId: user.id, status: inc.status, notes: `Changed: ${changed}` },
    });
  });

  await writeAudit({ action: 'UPDATE_INCIDENT', username: user.username, userId: user.id, details: `Updated ${id} (${changed})`, ctx });
  return getIncident(user, id);
}

export async function submitIncident(user: AuthUser, id: string, ctx: RequestContext) {
  const inc = await loadVisible(user, id);
  if (inc.createdBy !== user.id) {
    await denied(user, 'DENIED_WORKFLOW', id, 'submit by non-creator', ctx);
    throw forbidden('Only the officer who filed this incident can submit it');
  }
  if (!isEditableStatus(inc.status)) {
    await denied(user, 'DENIED_WORKFLOW', id, `submit while ${inc.status}`, ctx);
    throw conflict(`${id} is ${inc.status}; only Draft or Returned incidents can be submitted`);
  }
  const action = inc.status === 'Returned' ? 'Resubmitted' : 'Submitted';

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.incident.updateMany({
      where: { id, status: { in: [...EDITABLE_STATUSES] } },
      data: { status: 'Submitted' },
    });
    if (count === 0) throw conflict(`${id} changed state; reload and try again`);
    await tx.incidentTimeline.create({ data: { incidentId: id, action, userName: user.name, userId: user.id, status: 'Submitted' } });
    await notifyWorkflow(tx, inc, 'submitted', user);
  });

  await writeAudit({ action: 'SUBMIT_INCIDENT', username: user.username, userId: user.id, details: `${action}: ${id}`, ctx });
  return getIncident(user, id);
}

/**
 * The creator discards a draft they never submitted. Timeline rows are append-only (spec #25),
 * so the record is kept, marked discarded and hidden from every view, list and statistic.
 */
export async function discardDraft(user: AuthUser, id: string, notes: string | undefined, ctx: RequestContext) {
  const inc = await loadVisible(user, id);
  if (inc.createdBy !== user.id) {
    await denied(user, 'DENIED_UPDATE', id, 'discard by non-creator', ctx);
    throw forbidden('Only the officer who created this draft can discard it');
  }
  if (inc.status !== 'Draft') {
    await denied(user, 'DENIED_UPDATE', id, `discard while ${inc.status}`, ctx);
    throw conflict(`${id} is ${inc.status}; only a draft that was never submitted can be discarded`);
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.incident.updateMany({
      where: { id, status: 'Draft', discardedAt: null },
      data: { discardedAt: new Date(), discardedBy: user.id },
    });
    if (count === 0) throw conflict(`${id} changed state; reload and try again`);
    await tx.incidentTimeline.create({
      data: { incidentId: id, action: 'Discarded', userName: user.name, userId: user.id, status: 'Draft', notes: notes ?? null },
    });
  });

  await writeAudit({
    action: 'DISCARD_DRAFT',
    username: user.username,
    userId: user.id,
    details: `Discarded draft ${id} (${inc.title})${notes ? `: ${notes}` : ''}`,
    ctx,
  });
}

/** Discussion on an incident, separate from workflow actions; append-only (DB triggers). */
export async function addComment(user: AuthUser, id: string, body: string, ctx: RequestContext) {
  const inc = await loadVisible(user, id);
  if (!(await mayComment(user, inc))) {
    await denied(user, 'DENIED_UPDATE', id, inc.status === 'Draft' || inc.archivedAt ? `comment while ${inc.archivedAt ? 'archived' : inc.status}` : 'comment by read-only role', ctx);
    throw forbidden(inc.status === 'Draft' ? "Drafts can't be commented on" : inc.archivedAt ? 'Archived incidents are read-only' : "Your role can't comment on incidents");
  }
  await prisma.$transaction(async (tx) => {
    // Recipients are the creator and earlier commenters, so look them up before adding this one
    await notifyComment(tx, inc, user, body);
    await tx.incidentComment.create({ data: { incidentId: id, userId: user.id, userName: user.name, body } });
  });
  await writeAudit({
    action: 'COMMENT_INCIDENT',
    username: user.username,
    userId: user.id,
    details: `Commented on ${id}: ${body.length > 300 ? `${body.slice(0, 300)}…` : body}`,
    ctx,
  });
  return getIncident(user, id);
}

/** Printing puts a confidential record on paper: audited (spec #24). */
export async function recordPrint(user: AuthUser, id: string, ctx: RequestContext) {
  const inc = await loadVisible(user, id);
  await writeAudit({ action: 'PRINT_INCIDENT', username: user.username, userId: user.id, details: `Printed ${id} (${inc.title})`, ctx });
}

const EVENT_FOR: Record<WorkflowAction, WorkflowEvent> = {
  review: 'reviewed',
  verify: 'verified',
  approve: 'approved',
  close: 'closed',
  return: 'returned',
  reject: 'rejected',
};

/** Specs #13, #14 — supervisory transitions, guarded by status, role, ownership and concurrency. */
export async function runWorkflowAction(user: AuthUser, id: string, action: WorkflowAction, notes: string | undefined, ctx: RequestContext) {
  const step = WORKFLOW[action];
  const inc = await loadVisible(user, id);

  if (!step.allowed(user.role)) {
    await denied(user, 'DENIED_WORKFLOW', id, `${action} not permitted for role ${user.role}`, ctx);
    throw forbidden(`Your role cannot ${action} incidents`);
  }
  if (inc.createdBy === user.id) {
    await denied(user, 'DENIED_WORKFLOW', id, `${action} on own incident (separation of duties)`, ctx);
    throw forbidden('You cannot review, verify or approve an incident you filed');
  }
  if (!step.from.includes(inc.status)) {
    await denied(user, 'DENIED_WORKFLOW', id, `${action} while ${inc.status}`, ctx);
    throw conflict(`Cannot ${action} ${id}: it is ${inc.status} (allowed from ${step.from.join(', ')})`);
  }
  if (step.requiresNotes && !notes) throw badRequest(`A reason is required to ${action} an incident`);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.incident.updateMany({
      where: { id, status: { in: [...step.from] } },
      data: { status: step.status },
    });
    if (count === 0) throw conflict(`${id} changed state; reload and try again`);
    await tx.incidentTimeline.create({
      data: { incidentId: id, action: step.past, userName: user.name, userId: user.id, status: step.status, notes: notes ?? null },
    });
    await notifyWorkflow(tx, inc, EVENT_FOR[action], user, notes);
  });

  await writeAudit({
    action: `${action.toUpperCase()}_INCIDENT`,
    username: user.username,
    userId: user.id,
    details: `${step.past}: ${id}${notes ? ` — ${notes}` : ''}`,
    ctx,
  });
  return getIncident(user, id);
}

// ---------------------------------------------------------------------------
// GIS (specs #8, #18) — lightweight marker payload
// ---------------------------------------------------------------------------
export async function gisIncidents(user: AuthUser, q: Pick<ListIncidentsQuery, 'status' | 'severity' | 'category' | 'dateFrom' | 'dateTo'>) {
  const scope = await resolveScope(user.scope);
  const filters: Prisma.IncidentWhereInput[] = [visibilityWhere(user, scope), { lat: { not: null } }, { lng: { not: null } }];
  if (q.status?.length) filters.push({ status: { in: q.status } });
  if (q.severity?.length) filters.push({ severity: { in: q.severity } });
  if (q.category) filters.push({ category: q.category });
  if (q.dateFrom) filters.push({ incidentDate: { gte: fromDateString(q.dateFrom) } });
  if (q.dateTo) filters.push({ incidentDate: { lte: fromDateString(q.dateTo) } });

  const rows = await prisma.incident.findMany({
    where: { AND: filters },
    select: { id: true, title: true, category: true, severity: true, status: true, incidentDate: true, bop: true, sector: true, battalion: true, lat: true, lng: true },
    orderBy: { incidentDate: 'desc' },
    take: 5000,
  });
  return rows.map((r) => ({ ...r, incidentDate: undefined, date: toDateString(r.incidentDate), lat: Number(r.lat), lng: Number(r.lng) }));
}

// ---------------------------------------------------------------------------
// Form reference data, limited to what the user may file under
// ---------------------------------------------------------------------------
export async function incidentMeta(user: AuthUser) {
  const scope = await resolveScope(user.scope);
  const [categories, org] = await Promise.all([
    prisma.incidentCategory.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      include: { subcategories: { where: { isActive: true }, orderBy: { id: 'asc' }, select: { name: true } } },
    }),
    prisma.orgHierarchy.findMany({ orderBy: [{ sector: 'asc' }, { battalion: 'asc' }, { bop: 'asc' }] }),
  ]);

  // Same nested shape as ORG_HIERARCHY.HQ in the frontend seed
  const hierarchy: Record<string, Record<string, { BOPs: string[] }>> = {};
  for (const r of org.filter((o) => inScope(scope, o))) {
    ((hierarchy[r.sector] ??= {})[r.battalion] ??= { BOPs: [] }).BOPs.push(r.bop);
  }

  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, subcategories: c.subcategories.map((s) => s.name) })),
    hierarchy,
    severities: ['Low', 'Medium', 'High', 'Critical'],
    statuses: ['Draft', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed', 'Returned', 'Rejected'],
    // The role takes part in review/approval (shows the "Needs my action" view)
    canAct: actionableStatuses(user.role).length > 0,
  };
}
