// §19.5 — /api/v1/audit
import { api, downloadFrom } from './client';

/** Filters: q, action (comma list), username, dateFrom, dateTo, page, pageSize */
export const list = (query) => api('/audit', { query });
export const verify = () => api('/audit/verify');
/** format: csv | excel */
export const exportLog = (format, query) => downloadFrom(`/audit/export/${format}`, { query, fallbackName: `birds-audit.${format === 'excel' ? 'xlsx' : 'csv'}` });
