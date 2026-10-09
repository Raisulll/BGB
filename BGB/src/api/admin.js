// §19.8 — /api/v1/admin (admin only)
import { api } from './client';

export const getConfig = () => api('/admin/config');
/** values: { [key]: value } — all-or-nothing on the server */
export const updateConfig = (values) => api('/admin/config', { method: 'PATCH', body: { values } });

export const getPermissions = () => api('/admin/roles/permissions');
export const setPermission = (role, pageId, enabled) => api('/admin/roles/permissions', { method: 'PATCH', body: { role, pageId, enabled } });
export const resetPermissions = () => api('/admin/roles/permissions/reset', { method: 'POST' });

export const getCategories = () => api('/admin/categories');
export const createCategory = (data) => api('/admin/categories', { method: 'POST', body: data });
export const updateCategory = (id, patch) => api(`/admin/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });

export const getOrgHierarchy = () => api('/admin/org-hierarchy');
export const addOrgUnit = (data) => api('/admin/org-hierarchy', { method: 'POST', body: data });

/** Public liveness check: { status, database, time } */
export const health = () => api('/health');
