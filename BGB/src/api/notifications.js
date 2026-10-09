// §19.6 — /api/v1/notifications
import { api } from './client';

/** background: polling while the user is idle — must not keep the session alive (spec #28) */
export const list = (query, { background = false } = {}) => api('/notifications', { query, background });
export const markAllRead = () => api('/notifications/read-all', { method: 'PATCH' });
export const markRead = (id) => api(`/notifications/${id}/read`, { method: 'PATCH' });
