import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { permissionsFor, requirePermission } from '../../middleware/rbac.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { forbidden } from '../../utils/errors.js';
import { paginationSchema } from '../../utils/pagination.js';
import { requestContext } from '../../utils/requestContext.js';
import { declineWithToken } from './calls.realtime.js';
import * as service from './calls.service.js';

// /api/v1/calls — call log and WebRTC configuration (spec #58 extension). Signalling itself runs
// over the realtime channel (calls.realtime.ts).
export const callsRouter = Router();

// "Decline" on a call notification: no sign-in (it comes from the service worker); the token in
// the push allows only declining that call. Mounted before the authentication below.
callsRouter.post('/:id/decline', apiLimiter, async (req, res) => {
  const id = Number(req.params.id);
  const { token } = z.object({ token: z.string().max(200) }).strict().parse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !(await declineWithToken(id, token, requestContext(req)))) throw forbidden('This call can no longer be declined from the notification');
  res.status(204).end();
});

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
