import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { sendExport } from '../../utils/export.js';
import { requestContext } from '../../utils/requestContext.js';
import { auditExportTable, auditFiltersSchema, listAudit, listAuditSchema, verifyAuditChain } from './audit.query.js';
import { writeAudit } from './audit.service.js';

// §19.5 — /api/v1/audit (spec #24). Reading the trail is itself audited.
export const auditRouter = Router();
auditRouter.use(requireAuth, apiLimiter, requirePermission('audit'));

// Repeat identical views by the same user within this window are not logged again, so a page
// refresh or re-running a search doesn't flood the log being inspected. Per process; good enough.
const VIEW_DEDUPE_MS = 60_000;
const lastView = new Map<string, { details: string; at: number }>();

function describeFilters(q: { q?: string; action?: string[]; username?: string; dateFrom?: string; dateTo?: string }) {
  const parts = [
    q.q && `search "${q.q}"`,
    q.action?.length && `action ${q.action.join('/')}`,
    q.username && `user ${q.username}`,
    (q.dateFrom || q.dateTo) && `dates ${q.dateFrom ?? '…'} to ${q.dateTo ?? '…'}`,
  ].filter(Boolean);
  return parts.length ? `Searched the audit trail: ${parts.join(', ')}` : 'Accessed the system audit trail';
}

auditRouter.get('/', async (req, res) => {
  const q = listAuditSchema.parse(req.query);
  // One entry per view or search (first page), not per page turn
  if (q.page === 1) {
    const details = describeFilters(q).slice(0, 1000);
    const prev = lastView.get(req.user!.id);
    const now = Date.now();
    if (!prev || prev.details !== details || now - prev.at > VIEW_DEDUPE_MS) {
      lastView.set(req.user!.id, { details, at: now });
      await writeAudit({ action: 'VIEW_AUDIT_LOG', username: req.user!.username, userId: req.user!.id, details, ctx: requestContext(req) });
    }
  }
  res.json(await listAudit(q));
});

auditRouter.get('/verify', async (req, res) => {
  const result = await verifyAuditChain();
  await writeAudit({
    action: result.intact ? 'VERIFY_AUDIT_CHAIN' : 'AUDIT_CHAIN_BROKEN',
    username: req.user!.username,
    userId: req.user!.id,
    details: result.intact ? `Hash chain intact (${result.rowsChecked} entries)` : `Hash chain broken at seq ${result.firstBrokenSeq}`,
    ctx: requestContext(req),
  });
  res.json(result);
});

auditRouter.get('/export/:format', async (req, res) => {
  const format = req.params.format === 'csv' ? 'csv' : req.params.format === 'excel' ? 'excel' : null;
  if (!format) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Export format must be csv or excel' } });
    return;
  }
  const filters = auditFiltersSchema.parse(req.query);
  const table = await auditExportTable(filters, req.user!);
  await writeAudit({
    action: 'EXPORT_AUDIT_LOG',
    username: req.user!.username,
    userId: req.user!.id,
    details: `${format.toUpperCase()} export of ${table.rows.length} audit entries`,
    ctx: requestContext(req),
  });
  sendExport(res, format, table, 'BIRDS_Audit_Trail', 'Audit Trail');
});
