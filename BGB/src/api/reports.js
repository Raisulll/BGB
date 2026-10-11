// §19.7 — /api/v1/reports (filters are the incidents list filters)
import { api, downloadFrom } from './client';

export const summary = (query) => api('/reports/summary', { query });
/** granularity: day | week | month | quarter | year */
export const trends = (query) => api('/reports/trends', { query });
export const byCategory = (query) => api('/reports/by-category', { query });
export const bySeverity = (query) => api('/reports/by-severity', { query });
export const bySector = (query) => api('/reports/by-sector', { query });
/** type: operational | statistical | high-threat | sector-audit */
export const operational = (query) => api('/reports/operational', { query });
/** format: csv | excel */
export const exportReport = (format, query) => downloadFrom(`/reports/export/${format}`, { query, fallbackName: `birds-report.${format === 'excel' ? 'xlsx' : 'csv'}` });
/** Incident annex: full record of every incident in the report (max 100) → { incidents, total, limit, truncated } */
export const details = (query) => api('/reports/details', { query });
/** Reference number + audit entry before printing (same query as operational) → { reference, printedAt } */
export const recordPrint = (query) => api('/reports/print', { method: 'POST', query });
