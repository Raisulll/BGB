import { logger } from '../../config/logger.js';
import { prisma } from '../../db.js';
import { AppError, badRequest } from '../../utils/errors.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { CONFIG_DEFAULTS } from '../admin/config.service.js';
import { writeAudit } from '../audit/audit.service.js';
import { getIncident, loadVisible } from './incidents.service.js';
import { ARCHIVABLE_STATUSES, isArchivableStatus } from './workflow.js';

// Specs #44, #45 — archiving with audit trail and a configurable retention policy.
//  - Closed/Rejected incidents not updated for `archive.after_days` are archived (daily job or on
//    demand). Archived records leave the default incident lists and the map, stay in statistics,
//    and remain fully readable; nothing is deleted.
//  - `data.retention_days` marks archived records whose retention period has passed. They are
//    reported for review only: disposal of evidential records is never automatic (DOUBT-012).

type AuthUser = Express.AuthUser;
const SYSTEM = { name: 'BIRDS System', username: 'system' };
const DAY_MS = 86_400_000;
const ARCHIVE_LOCK = 4_510_045; // pg advisory lock id for the archiving run

async function intSetting(key: string) {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const n = Number(row?.value ?? CONFIG_DEFAULTS[key]!.value);
  return Number.isFinite(n) ? n : Number(CONFIG_DEFAULTS[key]!.value);
}

const conflict = (message: string) => new AppError(409, 'INVALID_STATE', message);

export async function archiveIncident(user: AuthUser, id: string, ctx: RequestContext) {
  const inc = await loadVisible(user, id);
  if (inc.archivedAt) throw conflict(`${id} is already archived`);
  if (!isArchivableStatus(inc.status)) throw conflict(`Only ${ARCHIVABLE_STATUSES.join(' or ')} incidents can be archived (${id} is ${inc.status})`);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.incident.updateMany({
      where: { id, archivedAt: null, status: { in: [...ARCHIVABLE_STATUSES] } },
      data: { archivedAt: new Date(), archivedBy: user.id },
    });
    if (count === 0) throw conflict(`${id} changed while archiving; reload and try again`);
    await tx.incidentTimeline.create({ data: { incidentId: id, action: 'Archived', userName: user.name, userId: user.id, status: inc.status } });
  });
  await writeAudit({ action: 'ARCHIVE_INCIDENT', username: user.username, userId: user.id, details: `Archived ${id} (${inc.status})`, ctx });
  return getIncident(user, id);
}

export async function restoreIncident(user: AuthUser, id: string, reason: string | undefined, ctx: RequestContext) {
  if (!reason) throw badRequest('A reason is required to restore an archived incident');
  const inc = await loadVisible(user, id);
  if (!inc.archivedAt) throw conflict(`${id} is not archived`);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.incident.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null, archivedBy: null } });
    if (count === 0) throw conflict(`${id} changed while restoring; reload and try again`);
    await tx.incidentTimeline.create({
      data: { incidentId: id, action: 'Restored from archive', userName: user.name, userId: user.id, status: inc.status, notes: reason },
    });
  });
  await writeAudit({ action: 'UNARCHIVE_INCIDENT', username: user.username, userId: user.id, details: `Restored ${id} from the archive — ${reason}`, ctx });
  return getIncident(user, id);
}

/**
 * Archives every final incident untouched for `archive.after_days`. Runs under a database advisory
 * lock, so with several PM2 workers only one does the work. `user` is null for the scheduled run.
 */
export async function runArchiving(user: AuthUser | null, ctx?: RequestContext) {
  const afterDays = await intSetting('archive.after_days');
  const cutoff = new Date(Date.now() - afterDays * DAY_MS);
  const actor = user ? { name: user.name, username: user.username, id: user.id } : { ...SYSTEM, id: null };

  const result = await prisma.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${ARCHIVE_LOCK}) AS locked`;
      if (!lock[0]?.locked) return { ids: [] as string[], skipped: true };

      const due = await tx.incident.findMany({
        where: { archivedAt: null, status: { in: [...ARCHIVABLE_STATUSES] }, updatedAt: { lt: cutoff } },
        select: { id: true, status: true },
        orderBy: { id: 'asc' },
      });
      if (due.length) {
        await tx.incident.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { archivedAt: new Date(), archivedBy: actor.id } });
        await tx.incidentTimeline.createMany({
          data: due.map((d) => ({
            incidentId: d.id,
            action: 'Archived',
            userName: actor.name,
            userId: actor.id,
            status: d.status,
            notes: `Archiving policy: final and not updated for ${afterDays} days`,
          })),
        });
      }
      return { ids: due.map((d) => d.id), skipped: false };
    },
    { timeout: 60_000 },
  );
  if (result.skipped) return { archived: 0, skipped: true, afterDays };

  // Audited after commit, so a rolled-back run leaves no claim behind
  await writeAudit({
    action: 'ARCHIVE_RUN',
    username: actor.username,
    userId: actor.id,
    details: `${user ? 'Manual' : 'Scheduled'} archiving run (after ${afterDays} days): ${result.ids.length} incident(s)${result.ids.length ? ` — ${result.ids.join(', ').slice(0, 900)}` : ''}`,
    ctx,
  });
  return { archived: result.ids.length, skipped: false, afterDays };
}

/** Counts for Admin › Security & System (specs #44, #45). */
export async function archiveSummary() {
  const [afterDays, retentionDays] = await Promise.all([intSetting('archive.after_days'), intSetting('data.retention_days')]);
  const now = Date.now();
  const [active, archived, dueForArchive, pastRetention, lastRun] = await Promise.all([
    prisma.incident.count({ where: { archivedAt: null, discardedAt: null } }),
    prisma.incident.count({ where: { archivedAt: { not: null } } }),
    prisma.incident.count({ where: { archivedAt: null, status: { in: [...ARCHIVABLE_STATUSES] }, updatedAt: { lt: new Date(now - afterDays * DAY_MS) } } }),
    prisma.incident.count({ where: { archivedAt: { not: null }, incidentDate: { lt: new Date(now - retentionDays * DAY_MS) } } }),
    prisma.auditLog.findFirst({ where: { action: 'ARCHIVE_RUN' }, orderBy: { seq: 'desc' }, select: { timestamp: true, details: true } }),
  ]);
  return {
    afterDays,
    retentionDays,
    active,
    archived,
    dueForArchive,
    pastRetention,
    lastRun: lastRun ? { at: lastRun.timestamp.toISOString(), details: lastRun.details } : null,
  };
}

let timer: NodeJS.Timeout | null = null;
/** Daily scheduled archiving (server.ts). The first run is a few minutes after start-up. */
export function startArchiveScheduler() {
  if (timer) return;
  const tick = () =>
    runArchiving(null)
      .then((r) => !r.skipped && r.archived && logger.info(`Archiving run: ${r.archived} incident(s) archived`))
      .catch((err) => logger.error('Archiving run failed', { err: String(err) }));
  const first = setTimeout(tick, 5 * 60_000);
  first.unref();
  timer = setInterval(tick, DAY_MS);
  timer.unref();
}

export function stopArchiveScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
