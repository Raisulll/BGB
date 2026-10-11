import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { requestContext } from '../../utils/requestContext.js';
import * as service from './push.service.js';

// /api/v1/push — this device's web push registration (calls and messages; spec #58 extension)
export const pushRouter = Router();
pushRouter.use(requireAuth, apiLimiter, requirePermission('messages'));

// Push service endpoints are HTTPS URLs; the keys are base64url strings from PushSubscription.toJSON()
const endpoint = z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'The endpoint must be an https URL');
const b64url = (max: number) => z.string().min(8).max(max).regex(/^[A-Za-z0-9_-]+=*$/, 'Invalid key');
const subscribeSchema = z
  .object({ endpoint, keys: z.object({ p256dh: b64url(200), auth: b64url(100) }), resume: z.boolean().optional() })
  .strip();
const endpointSchema = z.object({ endpoint }).strict();

pushRouter.get('/config', (_req, res) => {
  res.json(service.pushConfig());
});

pushRouter.get('/status', async (req, res) => {
  const { endpoint: ep } = z.object({ endpoint: endpoint.optional() }).parse(req.query);
  res.json(await service.status(req.user!, req.sessionId!, ep));
});

pushRouter.post('/subscriptions', async (req, res) => {
  const input = subscribeSchema.parse(req.body);
  res.json(await service.subscribe(req.user!, req.sessionId!, input, requestContext(req)));
});

pushRouter.delete('/subscriptions', async (req, res) => {
  const { endpoint: ep } = endpointSchema.parse(req.body);
  res.json(await service.unsubscribe(req.user!, ep, requestContext(req)));
});
