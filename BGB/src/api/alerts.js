// Flash Alerts (spec #23/#58 extension): urgent warnings delivered to every officer in the target sectors.
// /api/v1/alerts — raising needs the "raise_alert" permission; every user receives the alerts for their area.
import { api, fetchBlob } from './client';

export const list = ({ state = 'all', page = 1, pageSize = 25 } = {}, signal) => api('/alerts', { query: { state, page, pageSize }, signal });
/** Active alerts for me; fetching records delivery. Polled in the background (spec #28). */
export const active = ({ background = false } = {}) => api('/alerts/active', { background });
export const get = (id, signal) => api(`/alerts/${id}`, { signal });
export const options = (signal) => api('/alerts/options', { signal });
export const preview = (sectors, signal) => api('/alerts/preview', { query: { sectors: sectors.join(',') }, signal });

/** data: the alert fields (with declaration: true); files: File[] */
export function raise(data, files = []) {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  for (const f of files) form.append('files', f, f.name);
  return api('/alerts', { method: 'POST', body: form });
}

export const acknowledge = (id) => api(`/alerts/${id}/acknowledge`, { method: 'POST' });
export const postUpdate = (id, body) => api(`/alerts/${id}/updates`, { method: 'POST', body: { body } });
export const resolve = (id, notes) => api(`/alerts/${id}/resolve`, { method: 'POST', body: { notes } });
export const cancel = (id, notes) => api(`/alerts/${id}/cancel`, { method: 'POST', body: { notes } });
export const attachmentBlob = (id, aid, inline = true) => fetchBlob(`/alerts/${id}/attachments/${aid}`, { query: inline ? { inline: '1' } : undefined });
