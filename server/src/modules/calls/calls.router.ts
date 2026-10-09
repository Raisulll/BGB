import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { permissionsFor, requirePermission } from '../../middleware/rbac.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { forbidden } from '../../utils/errors.js';
import { paginationSchema } from '../../utils/pagination.js';
import * as service from './calls.service.js';

// /api/v1/calls — call log and WebRTC configuration (spec #58 extension). Signalling itself runs
// over the realtime channel (calls.realtime.ts).
export const callsRouter = Router();
callsRouter.use(requireAuth, apiLimiter, requirePermission('messages'));

callsRouter.get('/ice', (_req, res) => {
  res.json(service.iceServers());
});

callsRouter.get('/', async (req, res) => {
  const { page, pageSize } = paginationSchema.parse(req.query);
  res.json(await service.myCalls(req.user!, page, pageSize));
});

// Every call in the system: administrators and auditors
callsRouter.get('/all', async (req, res) => {
  const perms = await permissionsFor(req.user!.role);
  if (!perms.includes('admin') && !perms.includes('audit')) throw forbidden('Only administrators and auditors can see all calls');
  const { page, pageSize, userId } = paginationSchema.extend({ userId: z.string().regex(/^U\d{3,}$/).optional() }).parse(req.query);
  res.json(await service.allCalls(page, pageSize, userId));
});
