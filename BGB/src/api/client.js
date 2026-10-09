// Core HTTP client for the BIRDS REST API (CLAUDE.md §18.2, §19).
//
// - The access token lives only in memory; the refresh token is an httpOnly cookie the browser
//   sends to /api/v1/auth automatically, so page scripts never see it (spec #26, #28).
// - An expired access token (401 TOKEN_INVALID) triggers one refresh, shared by every request
//   that is waiting on it. The server treats a second refresh with an already-rotated token as
//   token reuse, so there must never be two refreshes in flight (server README, "Reuse detection").
// - Any other 401 means the session is over (logout elsewhere, idle timeout, deactivation);
//   the registered handler clears the app state and the router sends the user to /login.

export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let refreshing = null;
let onSessionEnded = () => {};

export const setAccessToken = (token) => {
  accessToken = token || null;
};
export const hasAccessToken = () => Boolean(accessToken);

/** AppContext registers this to drop the user when the server ends the session. */
export const setSessionEndedHandler = (fn) => {
  onSessionEnded = fn;
};

const buildUrl = (path, query) => {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
};

async function toApiError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {}
  const e = body?.error;
  return new ApiError(res.status, e?.code || `HTTP_${res.status}`, e?.message || res.statusText || 'Request failed', e?.details);
}

const BACKGROUND_HEADER = { 'X-Background-Request': '1' };

/**
 * Exchanges the refresh cookie for a new access token. Returns the session body or throws.
 * `background`: caused by polling, so the server doesn't count it as user activity (spec #28).
 */
export function refreshSession(background = false) {
  if (!refreshing) {
    const run = async () => {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: background ? BACKGROUND_HEADER : {},
      });
      if (!res.ok) throw await toApiError(res);
      const body = await res.json();
      setAccessToken(body.accessToken);
      return body;
    };
    // Tabs share the refresh cookie. Serialise refreshes across tabs so each one sends the cookie
    // the previous one rotated in, instead of racing on the same token.
    refreshing = (navigator.locks ? navigator.locks.request('birds-token-refresh', run) : run()).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function send(path, { method = 'GET', body, query, headers = {}, signal, background } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const init = {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(background ? BACKGROUND_HEADER : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  };
  return fetch(buildUrl(path, query), init);
}

/**
 * Sends a request and returns the raw Response once it is OK; handles refresh and session end.
 * Options: method, body (object or FormData), query, headers, signal, background, noRefresh.
 */
export async function request(path, options = {}) {
  let res = await send(path, options);
  // A static host with an SPA fallback answers /api/* with index.html: there is no API behind it
  if ((res.headers.get('Content-Type') || '').includes('text/html')) {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the BIRDS API.');
  }

  if (res.status === 401 && !options.noRefresh) {
    const err = await toApiError(res);
    if (err.code === 'TOKEN_INVALID' && accessToken) {
      try {
        await refreshSession(options.background);
      } catch (refreshErr) {
        setAccessToken(null);
        onSessionEnded(refreshErr);
        throw refreshErr;
      }
      res = await send(path, options);
      if (res.ok) return res;
      const retryErr = await toApiError(res);
      if (res.status === 401) {
        setAccessToken(null);
        onSessionEnded(retryErr);
      }
      throw retryErr;
    }
    setAccessToken(null);
    onSessionEnded(err);
    throw err;
  }

  if (!res.ok) {
    const err = await toApiError(res);
    // After an admin reset every route except /me, /logout and /change-password returns this.
    if (err.code === 'PASSWORD_CHANGE_REQUIRED') onSessionEnded(err);
    throw err;
  }
  return res;
}

/** JSON request helper. Returns the parsed body, or null for 204. */
export async function api(path, options) {
  const res = await request(path, options);
  if (res.status === 204) return null;
  const type = res.headers.get('Content-Type') || '';
  return type.includes('application/json') ? res.json() : res.text();
}

const filenameFrom = (res, fallback) => {
  const cd = res.headers.get('Content-Disposition') || '';
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {}
  }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : fallback;
};

/** Fetches an authenticated file and returns { blob, filename }. */
export async function fetchBlob(path, { query, fallbackName = 'download' } = {}) {
  const res = await request(path, { query });
  return { blob: await res.blob(), filename: filenameFrom(res, fallbackName) };
}

/** Downloads an authenticated file (exports, evidence) via a temporary object URL. */
export async function downloadFrom(path, options) {
  const { blob, filename } = await fetchBlob(path, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

/** User-facing message for any error thrown by this module. */
export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.code === 'NETWORK') return 'Cannot reach the BIRDS server.';
    return err.message || fallback;
  }
  if (err?.name === 'AbortError') return '';
  if (err instanceof TypeError) return 'Cannot reach the BIRDS server.';
  return err?.message || fallback;
};
