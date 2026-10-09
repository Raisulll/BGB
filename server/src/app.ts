import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, env } from './config/env.js';
import { prisma } from './db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { adminRouter } from './modules/admin/admin.router.js';
import { auditRouter } from './modules/audit/audit.router.js';
import { authRouter } from './modules/auth/auth.router.js';
import { evidenceRouter } from './modules/evidence/evidence.router.js';
import { gisRouter } from './modules/gis/gis.router.js';
import { incidentsRouter } from './modules/incidents/incidents.router.js';
import { notificationsRouter } from './modules/notifications/notifications.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { usersRouter } from './modules/users/users.router.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind Nginx (§15) so req.ip / secure cookies reflect the real client
  app.set('trust proxy', env.TRUST_PROXY);

  // Spec #49 — security headers. HSTS is only meaningful over HTTPS; Nginx terminates TLS (spec #27).
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true, // refresh-token cookie
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  const api = express.Router();

  // Public liveness/readiness probe for uptime monitoring (spec #40)
  api.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down', time: new Date().toISOString() });
    }
  });

  api.use('/auth', authRouter);
  // Before the incidents router, whose /:id/:action route would otherwise capture /evidence
  api.use('/incidents/:id/evidence', evidenceRouter);
  api.use('/incidents', incidentsRouter);
  api.use('/gis', gisRouter);
  api.use('/users', usersRouter);
  api.use('/admin', adminRouter);
  api.use('/audit', auditRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/reports', reportsRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
