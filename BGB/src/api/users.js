// §19.2 — /api/v1/users (admin only)
import { api } from './client';

export const list = (query) => api('/users', { query });
export const get = (id) => api(`/users/${encodeURIComponent(id)}`);
export const create = (data) => api('/users', { method: 'POST', body: data });
/** patch: name, role, scope, email, isActive, unlock */
export const update = (id, patch) => api(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
export const deactivate = (id) => api(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
