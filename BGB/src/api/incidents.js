// §19.3, §19.4, §19.9 — incidents, workflow, evidence and GIS
import { api, downloadFrom, fetchBlob } from './client';

/** Filters: q, status, severity, category, sector, battalion, bop, dateFrom, dateTo, createdBy ('me'), needsAction, archived, sort, order, page, pageSize */
export const list = (query, signal) => api('/incidents', { query, signal });
export const meta = () => api('/incidents/meta');
export const get = (id, signal) => api(`/incidents/${encodeURIComponent(id)}`, { signal });
export const timeline = (id) => api(`/incidents/${encodeURIComponent(id)}/timeline`);

/** status: 'Draft' | 'Submitted' */
export const create = (data, status) => api('/incidents', { method: 'POST', body: { ...data, status } });
export const update = (id, data) => api(`/incidents/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
export const submit = (id) => api(`/incidents/${encodeURIComponent(id)}/submit`, { method: 'POST' });
/** Adds a comment; returns the incident with its comments. */
export const comment = (id, body) => api(`/incidents/${encodeURIComponent(id)}/comments`, { method: 'POST', body: { body } });
/** Audit entry for printing a single incident (the browser does the printing). */
export const recordPrint = (id) => api(`/incidents/${encodeURIComponent(id)}/print`, { method: 'POST' });
/** The creator discards a never-submitted draft (kept on record, hidden everywhere). Reason optional. */
export const discard = (id, notes) => api(`/incidents/${encodeURIComponent(id)}`, { method: 'DELETE', body: notes ? { notes } : undefined });

/** action: review | verify | approve | close | return | reject. Return/reject need notes. */
export const workflow = (id, action, notes) =>
  api(`/incidents/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: notes ? { notes } : {} });

// ---- Evidence (§19.4) ----
const evidencePath = (id, eid = '') => `/incidents/${encodeURIComponent(id)}/evidence${eid !== '' ? `/${eid}` : ''}`;

export function uploadEvidence(id, files) {
  const form = new FormData();
  for (const f of files) {
    form.append('files', f, f.name);
    form.append('lastModified', String(f.lastModified || ''));
  }
  return api(evidencePath(id), { method: 'POST', body: form });
}
export const downloadEvidence = (id, eid, name) => downloadFrom(evidencePath(id, eid), { fallbackName: name });
export const evidenceBlob = (id, eid) => fetchBlob(evidencePath(id, eid), { query: { inline: 1 } });
export const verifyEvidence = (id, eid) => api(`${evidencePath(id, eid)}/verify`, { method: 'POST' });
export const removeEvidence = (id, eid, reason) =>
  api(evidencePath(id, eid), { method: 'DELETE', body: reason ? { reason } : undefined });

// ---- GIS (§19.9) ----
export const gis = (query) => api('/gis/incidents', { query });

// ---- Archiving (spec #45, HQ administrators) ----
export const archive = (id) => api(`/incidents/${encodeURIComponent(id)}/archive`, { method: 'POST' });
export const restore = (id, notes) => api(`/incidents/${encodeURIComponent(id)}/unarchive`, { method: 'POST', body: { notes } });
