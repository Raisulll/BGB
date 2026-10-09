import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../db.js';

// Cross-process event bus for the realtime channel. Events go through PostgreSQL LISTEN/NOTIFY,
// so every API process (PM2 cluster mode, §26) hears every event and pushes it to its own sockets.
// Payloads carry ids, never content (NOTIFY payloads are limited to 8000 bytes); listeners load
// what they need. Publish only after the change is committed.
const CHANNEL = 'birds_events';

export type BusEvent =
  | { type: 'message.new'; conversationId: number; messageId: number; recipients: string[] }
  | { type: 'conversation.changed'; conversationId: number; recipients: string[] }
  | { type: 'read'; conversationId: number; userId: string }
  | { type: 'call'; to: string; payload: Record<string, unknown> };

type Handler = (event: BusEvent) => void;
const handlers = new Set<Handler>();
let client: pg.Client | null = null;
let stopping = false;

export function onBusEvent(handler: Handler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function publish(event: BusEvent) {
  try {
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`;
  } catch (err) {
    logger.error('Realtime publish failed', { err: String(err), type: event.type });
  }
}

/** Starts listening (server.ts). Reconnects if the connection drops. */
export async function startBus() {
  stopping = false;
  const connect = async () => {
    const c = new pg.Client({ connectionString: env.DATABASE_URL });
    c.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      let event: BusEvent;
      try {
        event = JSON.parse(msg.payload);
      } catch {
        return;
      }
      for (const h of handlers) {
        try {
          h(event);
        } catch (err) {
          logger.error('Realtime handler failed', { err: String(err) });
        }
      }
    });
    c.on('error', (err) => logger.warn('Realtime bus connection error', { err: String(err) }));
    c.on('end', () => {
      client = null;
      if (!stopping) setTimeout(() => void connect().catch(() => {}), 2_000);
    });
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    client = c;
    logger.info('Realtime bus listening');
  };
  await connect();
}

export async function stopBus() {
  stopping = true;
  await client?.end().catch(() => {});
  client = null;
}
