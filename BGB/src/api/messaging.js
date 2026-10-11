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

// Group administration (group admins; the server checks)
export const rename = (id, title) => api(`/messaging/conversations/${id}`, { method: 'PATCH', body: { title } });
export const removeMember = (id, userId) => api(`/messaging/conversations/${id}/members/${userId}`, { method: 'DELETE' });
export const setMemberRole = (id, userId, role) => api(`/messaging/conversations/${id}/members/${userId}`, { method: 'PATCH', body: { role } });
export const approveRequest = (id, requestId) => api(`/messaging/conversations/${id}/requests/${requestId}/approve`, { method: 'POST' });
export const rejectRequest = (id, requestId) => api(`/messaging/conversations/${id}/requests/${requestId}/reject`, { method: 'POST' });
export const setCover = (id, blob) => {
  const form = new FormData();
  form.append('image', blob, 'group.jpg');
  return api(`/messaging/conversations/${id}/cover`, { method: 'POST', body: form });
};
export const removeCover = (id) => api(`/messaging/conversations/${id}/cover`, { method: 'DELETE' });

// Group photos are fetched with the access token; one object URL per photo version, shared
const covers = new Map(); // url -> Promise<objectURL | null>
export function coverObjectUrl(url) {
  if (!covers.has(url)) {
    covers.set(
      url,
      fetchBlob(url.replace(/^\/api\/v1/, ''), { fallbackName: 'group', background: true })
        .then(({ blob }) => URL.createObjectURL(blob))
        .catch(() => {
          covers.delete(url); // try again next time
          return null;
        }),
    );
  }
  return covers.get(url);
}
