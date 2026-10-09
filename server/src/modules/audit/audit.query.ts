import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AuditLog, Prisma } from '../../generated/prisma/client.js';
import { bstDayStart, bstNextDayStart, toBstDisplay } from '../../utils/formatDate.js';
import { paged, paginationSchema, toSkipTake } from '../../utils/pagination.js';
import type { ExportTable } from '../../utils/export.js';

// §19.5 — reading the audit trail (spec #24). Writing lives in audit.service.ts.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const auditFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(), // username, details or IP
  action: z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[A-Z_]{2,100}$/)))
    .optional(),
  username: z.string().trim().max(50).optional(),
  dateFrom: isoDate.optional(), // Bangladesh calendar days
  dateTo: isoDate.optional(),
});
export const listAuditSchema = paginationSchema.extend(auditFiltersSchema.shape);

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { username: { contains: f.q, mode: 'insensitive' } },
        { details: { contains: f.q, mode: 'insensitive' } },
        { action: { contains: f.q, mode: 'insensitive' } },
      ],
    });
  }
  if (f.action?.length) and.push({ action: { in: f.action } });
  if (f.username) and.push({ username: f.username });
  if (f.dateFrom) and.push({ timestamp: { gte: bstDayStart(f.dateFrom) } });
  if (f.dateTo) and.push({ timestamp: { lt: bstNextDayStart(f.dateTo) } });
  return { AND: and };
}

const toDto = (a: AuditLog) => ({
  id: a.id,
  seq: Number(a.seq),
  timestamp: a.timestamp.toISOString(),
  username: a.username,
  userId: a.userId,
  action: a.action,
  details: a.details,
  ip: a.ipAddress,
  userAgent: a.userAgent,
  prevHash: a.prevHash,
  rowHash: a.rowHash,
});

export async function listAudit(q: z.infer<typeof listAuditSchema>) {
  const where = auditWhere(q);
  const [rows, total, actions] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' }, ...toSkipTake(q) }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  return { ...paged(rows.map(toDto), total, q), actions: actions.map((a) => a.action) };
}

export const EXPORT_LIMIT = 50_000;

export async function auditExportTable(f: AuditFilters, by: Express.AuthUser): Promise<ExportTable> {
  const rows = await prisma.auditLog.findMany({ where: auditWhere(f), orderBy: { seq: 'asc' }, take: EXPORT_LIMIT });
  const filters = Object.entries(f)
    .filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
    .join(', ');
  return {
    title: 'BIRDS SYSTEM AUDIT TRAIL — Border Guard Bangladesh',
    subtitle: `Generated ${toBstDisplay(new Date())} BST by ${by.name} (${by.role}); ${rows.length} entries${filters ? `; filters: ${filters}` : ''}`,
    headers: ['Seq', 'Timestamp (BST)', 'User', 'Action', 'Details', 'IP Address', 'Row Hash (SHA-256)'],
    rows: rows.map((a) => [Number(a.seq), toBstDisplay(a.timestamp), a.username, a.action, a.details, a.ipAddress, a.rowHash]),
  };
}

/** Runs the database's hash-chain check (prisma/sql/integrity.sql). */
export async function verifyAuditChain() {
  const [row] = await prisma.$queryRaw<{ rows_checked: bigint; first_broken_seq: bigint | null }[]>`SELECT * FROM audit_log_verify()`;
  return {
    rowsChecked: Number(row!.rows_checked),
    intact: row!.first_broken_seq === null,
    firstBrokenSeq: row!.first_broken_seq === null ? null : Number(row!.first_broken_seq),
    checkedAt: new Date().toISOString(),
  };
}
