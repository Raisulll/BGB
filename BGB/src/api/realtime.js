// Realtime channel: one WebSocket per tab to /api/v1/ws (same origin, so the CSP's connect-src
// 'self' covers it). It carries pushed messaging events and call signalling.
//
// - The first frame authenticates with the in-memory access token; after every token refresh the
//   new token is sent again so the server keeps the socket tied to a live session (spec #28).
// - Close code 4001 means the token or session is no longer valid: one background refresh is
//   tried, then the channel stays down until the next sign-in.
// - Other drops reconnect with backoff (1 s doubling to 30 s).
// - Socket traffic is never user activity: nothing here touches the idle timer.
import { API_BASE, getAccessToken, onAccessTokenChange, refreshSession } from './client';

const listeners = new Set();
const statusListeners = new Set();
let ws = null;
let ready = false;
let wanted = false;
let retryMs = 1000;
let retryTimer = null;
let unsubscribeToken = null;

const setReady = (value) => {
  if (ready === value) return;
  ready = value;
  for (const fn of statusListeners) fn(ready);
};

function socketUrl() {
  const base = API_BASE.startsWith('http') ? new URL(API_BASE) : new URL(API_BASE, window.location.origin);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${base.toString().replace(/\/$/, '')}/ws`;
}

function scheduleReconnect() {
  if (!wanted || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    open();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, 30_000);
}

function open() {
  const token = getAccessToken();
  if (!wanted || !token || ws) return;
  const socket = new WebSocket(socketUrl());
  ws = socket;
  socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: getAccessToken() }));
  socket.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      retryMs = 1000;
      setReady(true);
      return;
    }
    for (const fn of listeners) {
      try {
        fn(msg);
      } catch (err) {
        console.error(err);
      }
    }
  };
  socket.onclose = async (e) => {
    if (ws === socket) ws = null;
    setReady(false);
    if (!wanted) return;
    if (e.code === 4001) {
      // Expired token or ended session: try one refresh; if the session is over, stay down.
      try {
        await refreshSession(true);
      } catch {
        return;
      }
    }
    scheduleReconnect();
  };
}

/** Starts the channel (after sign-in). Safe to call more than once. */
export function connectRealtime() {
  wanted = true;
  unsubscribeToken ??= onAccessTokenChange((token) => {
    if (!token) return disconnectRealtime();
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'auth', token }));
    else open();
  });
  open();
}

/** Stops the channel (sign-out). */
export function disconnectRealtime() {
  wanted = false;
  clearTimeout(retryTimer);
  retryTimer = null;
  retryMs = 1000;
  unsubscribeToken?.();
  unsubscribeToken = null;
  const socket = ws;
  ws = null;
  socket?.close(1000, 'signed out');
  setReady(false);
}

/** Sends a frame; returns false when the channel is down. */
export function sendRealtime(msg) {
  if (!ready || ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

/** fn(msg) for every pushed event; returns an unsubscribe function. */
export function onRealtime(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** fn(ready) when the channel goes up or down; returns an unsubscribe function. */
export function onRealtimeStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export const realtimeReady = () => ready;
