// Web push registration for this device (calls and messages while BIRDS is closed).
import { api } from './client';

export const config = () => api('/push/config', { background: true });
export const status = (endpoint) => api('/push/status', { query: { endpoint }, background: true });
export const subscribe = (subscription, { resume = false } = {}) =>
  api('/push/subscriptions', { method: 'POST', body: { ...subscription, resume }, background: resume });
export const unsubscribe = (endpoint) => api('/push/subscriptions', { method: 'DELETE', body: { endpoint } });
