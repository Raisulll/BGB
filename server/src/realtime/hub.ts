import type { IncomingMessage, Server } from 'node:http';
import { isIP } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { corsOrigins, env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { getSecurityConfig } from '../modules/admin/config.service.js';
import { onBusEvent, type BusEvent } from './bus.js';

// Realtime channel (WebSocket at /api/v1/ws). Clients authenticate with their access token in the
// first message (never in the URL, which would end up in access logs). Every minute each socket's
// session is re-checked, so logout, deactivation and idle timeout (spec #28) close it; socket
// traffic never counts as user activity. Messages from clients are passed to registered handlers
// (call signalling), events from the bus are pushed to the right users.
const PATH = '/api/v1/ws';
const AUTH_TIMEOUT_MS = 10_000;
const RECHECK_MS = 60_000;
const PING_MS = 30_000;

export interface Client {
  ws: WebSocket;
  userId: string;
  name: string;
  sessionId: string;
  alive: boolean;
  ctx: { ip: string | null; userAgent: string | null }; // for audit entries
}

type ClientMessageHandler = (client: Client, msg: Record<string, unknown>) => void | Promise<void>;
type BusHandler = (event: BusEvent, send: (userId: string, payload: unknown) => number) => void | Promise<void>;

const clients = new Map<string, Set<Client>>(); // userId -> open, authenticated sockets
const messageHandlers = new Map<string, ClientMessageHandler>(); // by message type prefix
const busHandlers: BusHandler[] = [];
const closeHandlers: ((client: Client) => void)[] = [];
let wss: WebSocketServer | null = null;
let timers: NodeJS.Timeout[] = [];

/** Sends to every socket of a user on this process; returns how many sockets got it. */
export function sendToUser(userId: string, payload: unknown) {
  const set = clients.get(userId);
  if (!set) return 0;
  const text = JSON.stringify(payload);
  let n = 0;
  for (const c of set) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(text);
      n++;
    }
  }
  return n;
}

export const isOnlineHere = (userId: string) => (clients.get(userId)?.size ?? 0) > 0;

/** Client messages whose `type` starts with `prefix` (e.g. "call.") go to `handler`. */
export function onClientMessage(prefix: string, handler: ClientMessageHandler) {
  messageHandlers.set(prefix, handler);
}

/** Called when an authenticated socket closes (e.g. to end its call). */
export function onClientClose(handler: (client: Client) => void) {
  closeHandlers.push(handler);
}

/** Bus events, with a sender for this process's sockets. */
export function onEvent(handler: BusHandler) {
  busHandlers.push(handler);
}

function originAllowed(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return env.NODE_ENV !== 'production'; // non-browser clients only outside production
  if (corsOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host; // same origin (SPA served by this server)
  } catch {
    return false;
  }
}

const ipOf = (req: IncomingMessage) => {
  // Behind a proxy (Render, Nginx): walk X-Forwarded-For from the right past private proxy
  // addresses, like Express with TRUST_PROXY=loopback,uniquelocal. Entries further left were
  // written by the client and are not trusted.
  const isPrivate = (a: string) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:)/i.test(a);
  let ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  if (env.TRUST_PROXY && isPrivate(ip)) {
    const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((h) => h.trim().replace(/^::ffff:/, '')).filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) {
      ip = hops[i]!;
      if (!isPrivate(ip)) break;
    }
  }
  return isIP(ip) ? ip : null;
};

function remove(client: Client) {
  const set = clients.get(client.userId);
  set?.delete(client);
  if (set && set.size === 0) clients.delete(client.userId);
}

async function sessionStillValid(sessionId: string) {
  const s = await prisma.refreshToken.findUnique({ where: { id: sessionId }, include: { user: { select: { isActive: true } } } });
  if (!s || s.revoked || !s.user.isActive || s.expiresAt.getTime() <= Date.now()) return false;
  const { sessionTimeoutMinutes } = await getSecurityConfig();
  return Date.now() - s.lastSeenAt.getTime() <= sessionTimeoutMinutes * 60_000;
}

export function attachRealtime(server: Server) {
  wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || new URL(req.url, 'http://x').pathname !== PATH) return; // not ours
    if (!originAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      let client: Client | null = null;
      const ctx = { ip: ipOf(req), userAgent: req.headers['user-agent']?.slice(0, 500) ?? null };
      const authTimer = setTimeout(() => !client && ws.close(4001, 'auth required'), AUTH_TIMEOUT_MS);

      ws.on('message', async (data) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          // First authentication, or a fresh token after the access token was refreshed
          try {
            const { user, sessionId } = await authenticateToken(msg.token, { ctx, touch: false });
            if (client && client.userId !== user.id) return ws.close(4003, 'user changed');
            if (!client) {
              client = { ws, userId: user.id, name: user.name, sessionId, alive: true, ctx };
              if (!clients.has(user.id)) clients.set(user.id, new Set());
              clients.get(user.id)!.add(client);
              clearTimeout(authTimer);
            } else {
              client.sessionId = sessionId;
            }
            ws.send(JSON.stringify({ type: 'ready', userId: user.id }));
          } catch {
            ws.close(4001, 'auth failed');
          }
          return;
        }
        if (!client || typeof msg.type !== 'string') return;
        for (const [prefix, handler] of messageHandlers) {
          if (msg.type.startsWith(prefix)) {
            try {
              await handler(client, msg);
            } catch (err) {
              logger.warn('Realtime message handler failed', { type: msg.type, err: String(err) });
            }
          }
        }
      });
      ws.on('pong', () => client && (client.alive = true));
      ws.on('close', () => {
        clearTimeout(authTimer);
        if (client) {
          remove(client);
          for (const h of closeHandlers) {
            try {
              h(client);
            } catch (err) {
              logger.warn('Realtime close handler failed', { err: String(err) });
            }
          }
        }
      });
    });
  });

  // Bus events -> sockets on this process
  onBusEvent((event) => {
    for (const h of busHandlers) void Promise.resolve(h(event, sendToUser)).catch((err) => logger.warn('Realtime event handler failed', { err: String(err) }));
  });

  // Keep-alive, and end sockets whose session has ended
  timers.push(
    setInterval(() => {
      for (const set of clients.values())
        for (const c of set) {
          if (!c.alive) {
            c.ws.terminate();
            continue;
          }
          c.alive = false;
          c.ws.ping();
        }
    }, PING_MS),
    setInterval(async () => {
      for (const set of [...clients.values()])
        for (const c of [...set]) {
          if (!(await sessionStillValid(c.sessionId).catch(() => true))) c.ws.close(4001, 'session ended');
        }
    }, RECHECK_MS),
  );
  for (const t of timers) t.unref();
  logger.info(`Realtime channel at ${PATH}`);
}

export function stopRealtime() {
  for (const t of timers) clearInterval(t);
  timers = [];
  for (const set of clients.values()) for (const c of set) c.ws.close(1001, 'server shutting down');
  clients.clear();
  wss?.close();
  wss = null;
}
