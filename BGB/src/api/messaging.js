// Messaging (spec #58 extension): direct and group conversations, voice messages.
// /api/v1/messaging — messages are permanent records; there is no edit or delete.
import { api, fetchBlob } from './client';

export const directory = (q, signal) => api('/messaging/users', { query: { q }, signal });
export const unread = ({ background = false } = {}) => api('/messaging/unread', { background });
export const conversations = ({ background = false, signal } = {}) => api('/messaging/conversations', { background, signal });
export const conversation = (id, signal) => api(`/messaging/conversations/${id}`, { signal });
export const history = (id, { before, limit, background = false } = {}, signal) =>
  api(`/messaging/conversations/${id}/messages`, { query: { before, limit }, signal, background });

export const openDirect = (userId) => api('/messaging/conversations', { method: 'POST', body: { kind: 'direct', userId } });
export const createGroup = (title, memberIds) => api('/messaging/conversations', { method: 'POST', body: { kind: 'group', title, memberIds } });
export const send = (id, body) => api(`/messaging/conversations/${id}/messages`, { method: 'POST', body: { body } });

/** blob: the recording; durationMs: its length (the server checks 0.3–300 s). */
export const sendVoice = (id, blob, durationMs) => {
  const form = new FormData();
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  form.append('durationMs', String(Math.round(durationMs)));
  form.append('audio', blob, `voice.${ext}`);
  return api(`/messaging/conversations/${id}/voice`, { method: 'POST', body: form });
};

/** The server gives a full /api/v1/... URL; the client adds the base itself. */
export const voiceBlob = (url) => fetchBlob(url.replace(/^\/api\/v1/, ''), { fallbackName: 'voice' });

export const markRead = (id, lastReadId, { background = false } = {}) =>
  api(`/messaging/conversations/${id}/read`, { method: 'POST', body: { lastReadId }, background });
export const addMembers = (id, userIds) => api(`/messaging/conversations/${id}/members`, { method: 'POST', body: { userIds } });
export const leave = (id) => api(`/messaging/conversations/${id}/leave`, { method: 'POST' });
