// Database seeder (CLAUDE.md §18). Run with: npm run db:seed
// Idempotent: reference data is upserted; history (incidents, audit log, notifications) is only
// inserted into empty tables, because timeline and audit rows are append-only by design.
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db.js';
import { CONFIG_DEFAULTS } from '../src/modules/admin/config.service.js';
import { DEFAULT_PERMISSIONS, ROLE_DESCRIPTIONS } from '../src/utils/roles.js';
import { inScope, resolveScope } from '../src/utils/scope.js';
import {
  INCIDENT_CATEGORIES,
  NEXT_INCIDENT_ID,
  ORG_HIERARCHY,
  ROLES,
  SEED_AUDIT_LOG,
  SEED_INCIDENTS,
  SEED_NOTIFICATIONS,
  USERS,
} from './data/seed-data.js';

// Seed dates are relative to the day the seed runs: every date moves by the same whole number of days
// so the newest seed event falls on yesterday (Bangladesh), keeping the gaps and the times of day.
// With the fixed dates in seed-data.js, demo records dated after the seeding day would sort above
// incidents filed today and skew the trend charts. Tests set SEED_FIXED_DATES=true to stay deterministic.
const DAY_MS = 86_400_000;
const latestSeedDay = SEED_INCIDENTS.flatMap((i: { createdAt: string; timeline: { date: string }[] }) => [i.createdAt, ...i.timeline.map((t) => t.date)])
  .map((s: string) => s.slice(0, 10))
  .sort()
  .at(-1)!;
const todayDhaka = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);
const SHIFT_DAYS =
  process.env.SEED_FIXED_DATES === 'true' ? 0 : Math.round((Date.parse(todayDhaka) - DAY_MS - Date.parse(latestSeedDay)) / DAY_MS);
const shiftDay = (ymd: string) => new Date(Date.parse(ymd) + SHIFT_DAYS * DAY_MS).toISOString().slice(0, 10);
/** Moves every YYYY-MM-DD in a string (dates, timestamps, metadata text). */
const shiftText = (s: string) => s.replace(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g, shiftDay);

// Seed timestamps are Bangladesh local time (UTC+06:00).
const dhaka = (s: string) => new Date(`${shiftText(s).trim().replace(' ', 'T')}+06:00`);

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime',
};
const mimeFor = (name: string) => MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

const UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
function parseSize(size: string): bigint {
  const m = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec(size.trim());
  return m ? BigInt(Math.round(Number(m[1]) * UNITS[m[2]!.toUpperCase()]!)) : 0n;
}

// When the incident's current status began: the first timeline entry of the final run with that
// status (same rule as the backfill in migration status_since_and_comments)
function statusSince(inc: { status: string; createdAt: string; timeline: { date: string; status: string }[] }): Date {
  let since: string | null = null;
  for (const t of inc.timeline) {
    if (t.status !== inc.status) since = null;
    else since ??= t.date;
  }
  return dhaka(since ?? inc.createdAt);
}

// "2 hours ago" / "1 day ago" → Date
function relativeTime(text: string): Date {
  const m = /^(\d+)\s+(minute|hour|day|week)s?\s+ago$/i.exec(text.trim());
  if (!m) return new Date();
  const ms = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[m[2]!.toLowerCase() as 'minute']!;
  return new Date(Date.now() - Number(m[1]) * ms);
}

async function main() {
  // --- Roles + permissions -------------------------------------------------
  for (const name of ROLES as string[]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name, description: ROLE_DESCRIPTIONS[name] ?? null } });
  }
  for (const [role, pages] of Object.entries(DEFAULT_PERMISSIONS)) {
    for (const pageId of pages) {
      await prisma.rolePermission.upsert({
        where: { role_pageId: { role, pageId } },
        update: {},
        create: { role, pageId, enabled: true },
      });
    }
  }

  // --- Users (passwords hashed; existing users keep their current password) -
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        username: u.username,
        passwordHash: await bcrypt.hash(u.password, env.BCRYPT_ROUNDS),
        name: u.name,
        role: u.role,
        scope: u.scope,
        email: u.email,
      },
    });
  }
  const userByName = new Map(USERS.map((u) => [u.name, u.id]));
  const userByUsername = new Map(USERS.map((u) => [u.username, u.id]));

  // --- Org hierarchy (flattened) --------------------------------------------
  const orgRows = Object.entries(ORG_HIERARCHY.HQ).flatMap(([sector, battalions]) =>
    Object.entries(battalions as Record<string, { BOPs: string[] }>).flatMap(([battalion, { BOPs }]) =>
      BOPs.map((bop) => ({ hq: 'HQ', sector, battalion, bop })),
    ),
  );
  await prisma.orgHierarchy.createMany({ data: orgRows, skipDuplicates: true });

  // --- Categories -------------------------------------------------------------
  for (const c of INCIDENT_CATEGORIES) {
    await prisma.incidentCategory.upsert({ where: { id: c.id }, update: {}, create: { id: c.id, name: c.name } });
    await prisma.incidentSubcategory.createMany({
      data: c.subcategories.map((name: string) => ({ categoryId: c.id, name })),
      skipDuplicates: true,
    });
  }

  // --- System config ------------------------------------------------------------
  await prisma.systemConfig.createMany({
    data: Object.entries(CONFIG_DEFAULTS).map(([key, { value, description }]) => ({ key, value, description })),
    skipDuplicates: true,
  });
  // Per-year reference counter continues after the seeded incidents (BIRDS-2026-1001..1020 → next 1021)
  const seedYear = /^BIRDS-(\d{4})-/.exec(SEED_INCIDENTS[0]!.id)![1]!;
  await prisma.systemConfig.createMany({
    data: [{ key: `incident.next_id.${seedYear}`, value: String(NEXT_INCIDENT_ID), description: `Next incident reference number for ${seedYear}` }],
    skipDuplicates: true,
  });
  await prisma.systemConfig.deleteMany({ where: { key: 'incident.next_id' } }); // legacy single counter

  // --- Incidents + timeline + evidence (only into an empty table) ------------
  if ((await prisma.incident.count()) === 0) {
    for (const inc of SEED_INCIDENTS) {
      await prisma.incident.create({
        data: {
          id: inc.id,
          title: inc.title,
          category: inc.category,
          subcategory: inc.subcategory ?? null,
          severity: inc.severity,
          status: inc.status,
          incidentDate: new Date(`${shiftDay(inc.date)}T00:00:00Z`),
          incidentTime: new Date(`1970-01-01T${inc.time}:00Z`),
          location: inc.location ?? null,
          bop: inc.bop ?? null,
          sector: inc.sector ?? null,
          battalion: inc.battalion ?? null,
          lat: inc.lat ?? null,
          lng: inc.lng ?? null,
          description: inc.description,
          personsInvolved: inc.personsInvolved ?? null,
          actionTaken: inc.actionTaken ?? null,
          outcome: inc.outcome ?? null,
          createdBy: inc.createdBy,
          createdAt: dhaka(inc.createdAt),
          statusChangedAt: statusSince(inc),
          timeline: {
            create: inc.timeline.map((t: { action: string; user: string; date: string; status: string }) => ({
              action: t.action,
              userName: t.user,
              userId: userByName.get(t.user) ?? null,
              status: t.status,
              createdAt: dhaka(t.date),
            })),
          },
          evidence: {
            create: (inc.evidence ?? []).map((e: { name: string; size: string; date: string; metadata?: string }) => ({
              fileName: e.name,
              originalName: e.name,
              mimeType: mimeFor(e.name),
              fileSize: parseSize(e.size),
              storagePath: `seed-placeholder/${inc.id}/${e.name}`, // no file in object storage yet
              fileMetadata: e.metadata ? { source: shiftText(e.metadata) } : undefined,
              uploadedBy: inc.createdBy,
              uploadedAt: dhaka(`${e.date} 00:00`),
            })),
          },
        },
      });
    }
  }

  // --- Audit log (hash chain is computed by the DB trigger) -------------------
  if ((await prisma.auditLog.count()) === 0) {
    await prisma.auditLog.createMany({
      data: SEED_AUDIT_LOG.map((a: { timestamp: string; user: string; action: string; details: string; ip: string }) => ({
        timestamp: dhaka(a.timestamp),
        userId: userByUsername.get(a.user) ?? null,
        username: a.user,
        action: a.action,
        details: a.details,
        ipAddress: a.ip,
      })),
    });
  }

  // --- Notifications ------------------------------------------------------------
  // Read state lives on the row, so each recipient gets their own copy: every active user whose
  // scope covers the incident. Earlier seeds wrote shared "broadcast" rows (user_id NULL);
  // those are replaced.
  await prisma.notification.deleteMany({ where: { userId: null } });
  if ((await prisma.notification.count()) === 0) {
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, scope: true } });
    const rows = [];
    for (const n of SEED_NOTIFICATIONS as { title: string; message: string; time: string; read: boolean; type: string }[]) {
      const incidentId = /BIRDS-\d{4}-\d+/.exec(n.message)?.[0] ?? null;
      const incident = incidentId ? await prisma.incident.findUnique({ where: { id: incidentId } }) : null;
      for (const u of users) {
        if (incident && !inScope(await resolveScope(u.scope), incident)) continue;
        rows.push({ userId: u.id, title: n.title, message: n.message, type: n.type, isRead: n.read, incidentId, createdAt: relativeTime(n.time) });
      }
    }
    await prisma.notification.createMany({ data: rows });
  }

  const counts = {
    users: await prisma.user.count(),
    rolePermissions: await prisma.rolePermission.count(),
    orgHierarchy: await prisma.orgHierarchy.count(),
    categories: await prisma.incidentCategory.count(),
    subcategories: await prisma.incidentSubcategory.count(),
    incidents: await prisma.incident.count(),
    timeline: await prisma.incidentTimeline.count(),
    evidence: await prisma.evidence.count(),
    auditLog: await prisma.auditLog.count(),
    notifications: await prisma.notification.count(),
    systemConfig: await prisma.systemConfig.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
