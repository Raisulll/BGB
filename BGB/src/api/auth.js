// §19.1 — /api/v1/auth
import { api, refreshSession, setAccessToken } from './client';

// A flag (not a credential) that this browser may hold a refresh cookie. Without it, page loads
// skip the refresh attempt, so anonymous visits don't produce a 401 on every load.
const HINT_KEY = 'birds.session_hint';
export const setSessionHint = (on) => {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1');
    else localStorage.removeItem(HINT_KEY);
  } catch {}
};
const hasSessionHint = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true; // storage blocked: just try
  }
};

export async function login(username, password) {
  const body = await api('/auth/login', { method: 'POST', body: { username, password }, noRefresh: true });
  setAccessToken(body.accessToken);
  setSessionHint(true);
  return body;
}

/** Restores a session from the refresh cookie (page reload). Throws if there is none. */
export async function resume() {
  if (!hasSessionHint()) throw new Error('No session');
  try {
    return await refreshSession();
  } catch (err) {
    setSessionHint(false);
    throw err;
  }
}

export const me = () => api('/auth/me');
/** Own account, active sessions and recent sign-in events. */
export const profile = () => api('/auth/profile');
/** Signs out every other session of this user. */
export const revokeOtherSessions = () => api('/auth/sessions/revoke-others', { method: 'POST' });

/** reason: 'manual' | 'timeout' — a timeout is audited as SESSION_TIMEOUT (spec #28) */
export async function logout(reason = 'manual') {
  try {
    await api('/auth/logout', { method: 'POST', body: { reason } });
  } finally {
    setAccessToken(null);
    setSessionHint(false);
  }
}

export const changePassword = (currentPassword, newPassword) =>
  api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });

export const adminResetPassword = (userId, temporaryPassword) =>
  api('/auth/admin/reset-password', { method: 'POST', body: { userId, ...(temporaryPassword ? { temporaryPassword } : {}) } });
