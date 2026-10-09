import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest } from '../../utils/errors.js';
import type { ExportTable } from '../../utils/export.js';
import { toBstDisplay, toDateString, toDisplayDate, toTimeString } from '../../utils/formatDate.js';
import { listIncidentsSchema } from '../incidents/incidents.schema.js';
import { incidentWhere, type IncidentFilters } from '../incidents/incidents.service.js';
import { SEVERITIES, STATUSES } from '../incidents/workflow.js';

type AuthUser = Express.AuthUser;

// §19.7 — analytics & reports (specs #17, #19, #20, #21, #22). Everything is computed over
// *filed* incidents (drafts excluded) inside the caller's scope, with the same filters as the
// incidents list.
export const reportFiltersSchema = listIncidentsSchema.omit({ page: true, pageSize: true, sort: true, order: true });

export const REPORT_TYPES = {
  operational: 'OPERATIONAL LOG REPORT',
  statistical: 'STATISTICAL & THREAT SUMMARY',
  'high-threat': 'HIGH-THREAT ALERT DIGEST',
  'sector-audit': 'SECTOR PERFORMANCE REPORT',
} as const;
export type ReportType = keyof typeof REPORT_TYPES;
export const reportTypeSchema = z.enum(Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]]).default('operational');

const PENDING = ['Submitted', 'Reviewed', 'Verified'];
const RESOLVED = ['Closed', 'Rejected'];
const SEVERITY_WEIGHT: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

/** The high-threat digest is the operational report restricted to High + Critical. */
function applyType(f: IncidentFilters, type: ReportType): IncidentFilters {
  if (type !== 'high-threat') return f;
  const severity = (f.severity?.length ? f.severity : [...SEVERITIES]).filter((s) => s === 'High' || s === 'Critical');
  return { ...f, severity: severity.length ? severity : ['Critical'] };
}

// Statistics cover filed incidents, archived ones included (spec #45: archiving never removes history)
const where = (user: AuthUser, f: IncidentFilters) => incidentWhere(user, f, true, 'include');

// ---------------------------------------------------------------------------
// Summary / KPIs (spec #17)
// ---------------------------------------------------------------------------
export async function summary(user: AuthUser, f: IncidentFilters) {
  const w = await where(user, f);
  const [byStatusRows, bySeverityRows, criticalOpen] = await Promise.all([
    prisma.incident.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    prisma.incident.groupBy({ by: ['severity'], where: w, _count: { _all: true } }),
    prisma.incident.count({ where: { AND: [w, { severity: { in: ['High', 'Critical'] } }, { status: { notIn: RESOLVED } }] } }),
  ]);
  const byStatus = Object.fromEntries(STATUSES.filter((s) => s !== 'Draft').map((s) => [s, 0])) as Record<string, number>;
  for (const r of byStatusRows) byStatus[r.status] = r._count._all;
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of bySeverityRows) bySeverity[r.severity] = r._count._all;

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const sum = (keys: string[]) => keys.reduce((n, k) => n + (byStatus[k] ?? 0), 0);
  return {
    total,
    pendingReview: sum(PENDING),
    returned: byStatus.Returned ?? 0,
    approved: byStatus.Approved ?? 0,
    closed: byStatus.Closed ?? 0,
    rejected: byStatus.Rejected ?? 0,
    open: total - sum(RESOLVED),
    highSeverityOpen: criticalOpen,
    byStatus,
    bySeverity,
  };
}

// ---------------------------------------------------------------------------
// Trends (spec #20) — day / week / month / quarter / year buckets over incident date
// ---------------------------------------------------------------------------
export const granularitySchema = z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month');
export type Granularity = z.infer<typeof granularitySchema>;
const MAX_BUCKETS = 750;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function bucketStart(d: Date, g: Granularity): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  switch (g) {
    case 'day':
      return utc(y, m, d.getUTCDate());
    case 'week': {
      const dow = (d.getUTCDay() + 6) % 7; // ISO week: Monday = 0
      return utc(y, m, d.getUTCDate() - dow);
    }
    case 'month':
      return utc(y, m, 1);
    case 'quarter':
      return utc(y, m - (m % 3), 1);
    case 'year':
      return utc(y, 0, 1);
  }
}

function nextBucket(d: Date, g: Granularity): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  return g === 'day' ? utc(y, m, day + 1) : g === 'week' ? utc(y, m, day + 7) : g === 'month' ? utc(y, m + 1, 1) : g === 'quarter' ? utc(y, m + 3, 1) : utc(y + 1, 0, 1);
}

/** ISO 8601 week: weeks start Monday; week 1 contains the year's first Thursday. */
export function isoWeek(d: Date) {
  // The Thursday of d's week decides which year the week belongs to
  const thursday = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - utc(year, 0, 1).getTime()) / 604_800_000);
  return { year, week };
}

function label(d: Date, g: Granularity) {
  const iso = toDateString(d);
  if (g === 'day') return iso;
  if (g === 'week') {
    const { year, week } = isoWeek(d);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  if (g === 'month') return iso.slice(0, 7);
  if (g === 'quarter') return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  return String(d.getUTCFullYear());
}

export async function trends(user: AuthUser, f: IncidentFilters, g: Granularity) {
  const daily = await prisma.incident.groupBy({ by: ['incidentDate', 'severity'], where: await where(user, f), _count: { _all: true } });

  // Range: the filter dates if given; otherwise the last 12 months (by default) up to today
  const today = new Date(`${toDateString(new Date(Date.now() + 6 * 3_600_000))}T00:00:00Z`);
  const to = f.dateTo ? new Date(`${f.dateTo}T00:00:00Z`) : daily.reduce((max, r) => (r.incidentDate > max ? r.incidentDate : max), today);
  const from = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00Z`) : utc(to.getUTCFullYear(), to.getUTCMonth() - 11, 1);
  if (from > to) throw badRequest('dateFrom must not be after dateTo');

  const buckets = new Map<string, { period: string; start: string; count: number; bySeverity: Record<string, number> }>();
  for (let b = bucketStart(from, g); b <= to; b = nextBucket(b, g)) {
    if (buckets.size >= MAX_BUCKETS) throw badRequest(`Too many ${g} periods in this range; narrow the dates or use a larger granularity`);
    buckets.set(toDateString(b), { period: label(b, g), start: toDateString(b), count: 0, bySeverity: { Low: 0, Medium: 0, High: 0, Critical: 0 } });
  }
  for (const r of daily) {
    if (r.incidentDate < from || r.incidentDate > to) continue;
    const bucket = buckets.get(toDateString(bucketStart(r.incidentDate, g)));
    if (!bucket) continue;
    bucket.count += r._count._all;
    bucket.bySeverity[r.severity] = (bucket.bySeverity[r.severity] ?? 0) + r._count._all;
  }
  return { granularity: g, from: toDateString(from), to: toDateString(to), series: [...buckets.values()] };
}

// ---------------------------------------------------------------------------
// Breakdowns (spec #19)
// ---------------------------------------------------------------------------
/** Counts per category, with the high/critical share and a subcategory breakdown (spec #19). */
export async function byCategory(user: AuthUser, f: IncidentFilters) {
  const [rows, categories] = await Promise.all([
    prisma.incident.groupBy({ by: ['category', 'subcategory', 'severity'], where: await where(user, f), _count: { _all: true } }),
    prisma.incidentCategory.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, select: { name: true } }),
  ]);
  const stats = new Map<string, { count: number; highSeverity: number; subs: Map<string, number> }>();
  for (const r of rows) {
    const s = stats.get(r.category) ?? { count: 0, highSeverity: 0, subs: new Map<string, number>() };
    const n = r._count._all;
    s.count += n;
    if (r.severity === 'High' || r.severity === 'Critical') s.highSeverity += n;
    const sub = r.subcategory ?? 'Unspecified';
    s.subs.set(sub, (s.subs.get(sub) ?? 0) + n);
    stats.set(r.category, s);
  }
  const names = [...new Set([...categories.map((c) => c.name), ...stats.keys()])];
  return names
    .map((category) => {
      const s = stats.get(category);
      return {
        category,
        count: s?.count ?? 0,
        highSeverity: s?.highSeverity ?? 0,
        subcategories: [...(s?.subs ?? new Map<string, number>())]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export async function bySeverity(user: AuthUser, f: IncidentFilters) {
  const rows = await prisma.incident.groupBy({ by: ['severity'], where: await where(user, f), _count: { _all: true } });
  const counts = new Map(rows.map((r) => [r.severity, r._count._all]));
  return SEVERITIES.map((severity) => ({ severity, count: counts.get(severity) ?? 0 }));
}

/** Risk distribution by sector: counts per severity and a weighted score (Low 1 … Critical 4). */
export async function bySector(user: AuthUser, f: IncidentFilters) {
  const rows = await prisma.incident.groupBy({ by: ['sector', 'severity'], where: await where(user, f), _count: { _all: true } });
  const sectors = new Map<string, { sector: string; total: number; riskScore: number; bySeverity: Record<string, number> }>();
  for (const r of rows) {
    const key = r.sector ?? 'Unassigned';
    const s = sectors.get(key) ?? { sector: key, total: 0, riskScore: 0, bySeverity: { Low: 0, Medium: 0, High: 0, Critical: 0 } };
    s.total += r._count._all;
    s.riskScore += r._count._all * (SEVERITY_WEIGHT[r.severity] ?? 0);
    s.bySeverity[r.severity] = (s.bySeverity[r.severity] ?? 0) + r._count._all;
    sectors.set(key, s);
  }
  return [...sectors.values()].sort((a, b) => b.riskScore - a.riskScore);
}

// ---------------------------------------------------------------------------
// Configurable report (spec #21) and exports (spec #22)
// ---------------------------------------------------------------------------
export const REPORT_ROW_LIMIT = 5000;

async function reportRows(user: AuthUser, f: IncidentFilters) {
  return prisma.incident.findMany({
    where: await where(user, f),
    include: { creator: { select: { name: true } } },
    orderBy: [{ incidentDate: 'desc' }, { id: 'desc' }],
    take: REPORT_ROW_LIMIT,
  });
}

function describeFilters(f: IncidentFilters) {
  return Object.entries(f)
    .filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
    .join(', ');
}

export async function operationalReport(user: AuthUser, filters: IncidentFilters, type: ReportType) {
  const f = applyType(filters, type);
  const [kpis, severities, categories, sectors, rows] = await Promise.all([
    summary(user, f),
    bySeverity(user, f),
    byCategory(user, f),
    bySector(user, f),
    reportRows(user, f),
  ]);
  return {
    meta: {
      type,
      title: `BIRDS ${REPORT_TYPES[type]}`,
      classification: 'CONFIDENTIAL // OPERATIONAL',
      generatedAt: new Date().toISOString(),
      generatedBy: { name: user.name, role: user.role, scope: user.scope },
      filters: f,
      truncated: rows.length === REPORT_ROW_LIMIT && kpis.total > REPORT_ROW_LIMIT,
    },
    summary: kpis,
    bySeverity: severities,
    byCategory: categories,
    bySector: sectors,
    incidents: rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      subcategory: r.subcategory,
      severity: r.severity,
      status: r.status,
      date: toDateString(r.incidentDate),
      time: toTimeString(r.incidentTime),
      location: r.location,
      bop: r.bop,
      battalion: r.battalion,
      sector: r.sector,
      createdByName: r.creator.name,
    })),
  };
}

export async function reportExportTable(user: AuthUser, filters: IncidentFilters, type: ReportType): Promise<ExportTable> {
  const f = applyType(filters, type);
  const rows = await reportRows(user, f);
  const fdesc = describeFilters(f);
  return {
    title: `BIRDS ${REPORT_TYPES[type]} — Border Guard Bangladesh`,
    subtitle: `Generated ${toBstDisplay(new Date())} BST by ${user.name} (${user.role}, ${user.scope}); ${rows.length} incidents${fdesc ? `; filters: ${fdesc}` : ''}${rows.length === REPORT_ROW_LIMIT ? `; limited to ${REPORT_ROW_LIMIT} rows` : ''}`,
    headers: ['Reference No.', 'Title', 'Category', 'Subcategory', 'Severity', 'Status', 'Date', 'Time', 'Location', 'BOP', 'Battalion', 'Sector', 'Latitude', 'Longitude', 'Filed By', 'Filed At (BST)'],
    rows: rows.map((r) => [
      r.id,
      r.title,
      r.category,
      r.subcategory,
      r.severity,
      r.status,
      toDisplayDate(toDateString(r.incidentDate)),
      toTimeString(r.incidentTime),
      r.location,
      r.bop,
      r.battalion,
      r.sector,
      r.lat === null ? null : Number(r.lat),
      r.lng === null ? null : Number(r.lng),
      r.creator.name,
      toBstDisplay(r.createdAt),
    ]),
  };
}

