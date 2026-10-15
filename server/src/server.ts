import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './db.js';
import { startMailWorker, stopMailWorker } from './modules/notifications/mailer.js';
import { startArchiveScheduler, stopArchiveScheduler } from './modules/incidents/archive.service.js';
import { registerMessagingRealtime } from './modules/messaging/messaging.realtime.js';
import { registerAlertsRealtime } from './modules/alerts/alerts.realtime.js';
import { registerCallRealtime } from './modules/calls/calls.realtime.js';
import { sweepStaleCalls } from './modules/calls/calls.service.js';
import { startBus, stopBus } from './realtime/bus.js';
import { attachRealtime, stopRealtime } from './realtime/hub.js';
import { startKeepAwake, stopKeepAwake } from './keepAwake.js';

// Entry point. In production run under PM2 cluster mode (ecosystem.config.cjs) — §26.
const server = createApp().listen(env.PORT, () => {
  logger.info(`BIRDS API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
  startMailWorker();
  startArchiveScheduler();
  startKeepAwake();
});

// Realtime channel (messaging, calls): WebSocket on the same port, events via PostgreSQL NOTIFY
registerMessagingRealtime();
registerAlertsRealtime();
registerCallRealtime();
sweepStaleCalls().catch((err) => logger.warn('Stale call clean-up failed', { err: String(err) }));
attachRealtime(server);
startBus().catch((err) => logger.error('Realtime bus failed to start', { err: String(err) }));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  stopMailWorker();
  stopArchiveScheduler();
  stopKeepAwake();
  stopRealtime();
  await stopBus();
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { reason }));
