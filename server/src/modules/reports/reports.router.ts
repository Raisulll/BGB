import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac.js';
import { sendExport } from '../../utils/export.js';
import { requestContext } from '../../utils/requestContext.js';
import { writeAudit } from '../audit/audit.service.js';
import * as service from './reports.service.js';

// §19.7 — /api/v1/reports. KPI/trend/breakdown endpoints feed both the Dashboard (every role)
// and the Analytics page, so they accept either permission; data is always scoped to the user.
export const reportsRouter = Router();
reportsRouter.use(requireAuth, apiLimiter);

const analytics = requireAnyPermission('dashboard', 'analytics');
const filters = (req: Request) => service.reportFiltersSchema.parse(req.query);

reportsRouter.get('/summary', analytics, async (req, res) => {
  res.json(await service.summary(req.user!, filters(req)));
});

reportsRouter.get('/trends', analytics, async (req, res) => {
  const { granularity, ...rest } = req.query;
  res.json(await service.trends(req.user!, service.reportFiltersSchema.parse(rest), service.granularitySchema.parse(granularity)));
});

reportsRouter.get('/by-category', analytics, async (req, res) => {
  res.json(await service.byCategory(req.user!, filters(req)));
});

reportsRouter.get('/by-sector', analytics, async (req, res) => {
  res.json(await service.bySector(req.user!, filters(req)));
});

reportsRouter.get('/by-severity', analytics, async (req, res) => {
  res.json(await service.bySeverity(req.user!, filters(req)));
});

reportsRouter.get('/operational', requirePermission('reports'), async (req, res) => {
  const { type, ...rest } = req.query;
  res.json(await service.operationalReport(req.user!, service.reportFiltersSchema.parse(rest), service.reportTypeSchema.parse(type)));
});

// Incident annex: the full record of every incident in the report (capped at REPORT_DETAIL_LIMIT)
reportsRouter.get('/details', requirePermission('reports'), async (req, res) => {
  const { type, ...rest } = req.query;
  res.json(await service.reportDetails(req.user!, service.reportFiltersSchema.parse(rest), service.reportTypeSchema.parse(type)));
});

// Reference number + audit entry before the browser prints the report (filters in the query, as GET;
// details=1 when the incident annex is included)
reportsRouter.post('/print', requirePermission('reports'), async (req, res) => {
  const { type, details, ...rest } = req.query;
  const withDetails = details === '1' || details === 'true';
  res.json(await service.recordReportPrint(req.user!, service.reportFiltersSchema.parse(rest), service.reportTypeSchema.parse(type), withDetails, requestContext(req)));
});

/** Shared by /reports/export/:format and /incidents/export/:format (§19.3, §19.7). */
export async function exportHandler(req: Request, res: Response) {
  const format = req.params.format === 'csv' ? 'csv' : req.params.format === 'excel' ? 'excel' : null;
  if (!format) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Export format must be csv or excel' } });
    return;
  }
  const { type: rawType, ...rest } = req.query;
  const type = service.reportTypeSchema.parse(rawType);
  const table = await service.reportExportTable(req.user!, service.reportFiltersSchema.parse(rest), type);
  await writeAudit({
    action: 'EXPORT_REPORT',
    username: req.user!.username,
    userId: req.user!.id,
    details: `${format.toUpperCase()} export of ${type} report (${table.rows.length} incidents)`,
    ctx: requestContext(req),
  });
  sendExport(res, format, table, `BIRDS_${type.toUpperCase().replace(/-/g, '_')}_Report`, 'Incidents');
}

reportsRouter.get('/export/:format', requirePermission('reports'), exportHandler);
