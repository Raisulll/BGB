import { Router, type Request } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { requestContext } from '../../utils/requestContext.js';
import {
  addMembersSchema,
  createConversationSchema,
  directoryQuerySchema,
  historyQuerySchema,
  memberIdParam,
  memberRoleSchema,
  readSchema,
  renameSchema,
  sendMessageSchema,
  voiceFieldsSchema,
} from './messaging.schema.js';
import * as service from './messaging.service.js';

// /api/v1/messaging — conversations, messages, voice messages (spec #58 extension)
export const messagingRouter = Router();
messagingRouter.use(requireAuth, apiLimiter, requirePermission('messages'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: service.MAX_VOICE_BYTES, files: 1, fields: 5 },
}).single('audio');

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: service.MAX_COVER_BYTES, files: 1, fields: 2 },
}).single('image');

const conversationId = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Conversation not found');
  return id;
};
const requestId = (req: Request) => {
  const id = Number(req.params.rid);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Request not found');
  return id;
};
const memberId = (req: Request) => {
  const r = memberIdParam.safeParse(req.params.uid);
  if (!r.success) throw notFound('Not a member of this group');
  return r.data;
};
const messageId = (req: Request) => {
  const id = Number(req.params.mid);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Message not found');
  return id;
};

messagingRouter.get('/users', async (req, res) => {
  const { q } = directoryQuerySchema.parse(req.query);
  res.json(await service.directory(req.user!, q));
});

messagingRouter.get('/unread', async (req, res) => {
  res.json(await service.unreadTotal(req.user!));
});

messagingRouter.get('/conversations', async (req, res) => {
  res.json(await service.listConversations(req.user!));
});

messagingRouter.post('/conversations', async (req, res) => {
  const input = createConversationSchema.parse(req.body);
  res.status(201).json(await service.createConversation(req.user!, input, requestContext(req)));
});

messagingRouter.get('/conversations/:id', async (req, res) => {
  res.json(await service.getConversation(req.user!, conversationId(req)));
});

messagingRouter.get('/conversations/:id/messages', async (req, res) => {
  const { before, limit } = historyQuerySchema.parse(req.query);
  res.json(await service.history(req.user!, conversationId(req), before, limit));
});

messagingRouter.post('/conversations/:id/messages', async (req, res) => {
  const { body } = sendMessageSchema.parse(req.body);
  res.status(201).json(await service.sendText(req.user!, conversationId(req), body));
});

messagingRouter.post('/conversations/:id/voice', (req, res, next) => upload(req, res, (err) => (err ? next(err) : next())), async (req, res) => {
  if (!req.file) throw badRequest('Attach the recording as "audio"');
  const { durationMs } = voiceFieldsSchema.parse(req.body);
  res.status(201).json(await service.sendVoice(req.user!, conversationId(req), req.file.buffer, durationMs, requestContext(req)));
});

messagingRouter.get('/conversations/:id/messages/:mid/audio', async (req, res) => {
  const { data, mime } = await service.voiceAudio(req.user!, conversationId(req), messageId(req));
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(data.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(data);
});

messagingRouter.post('/conversations/:id/read', async (req, res) => {
  const { lastReadId } = readSchema.parse(req.body);
  res.json(await service.markRead(req.user!, conversationId(req), lastReadId));
});

messagingRouter.post('/conversations/:id/members', async (req, res) => {
  const { userIds } = addMembersSchema.parse(req.body);
  res.json(await service.addMembers(req.user!, conversationId(req), userIds, requestContext(req)));
});

// Group administration (group admins only, checked in the service)
messagingRouter.patch('/conversations/:id', async (req, res) => {
  const { title } = renameSchema.parse(req.body);
  res.json(await service.renameGroup(req.user!, conversationId(req), title, requestContext(req)));
});

messagingRouter.delete('/conversations/:id/members/:uid', async (req, res) => {
  res.json(await service.removeMember(req.user!, conversationId(req), memberId(req), requestContext(req)));
});

messagingRouter.patch('/conversations/:id/members/:uid', async (req, res) => {
  const { role } = memberRoleSchema.parse(req.body);
  res.json(await service.setMemberRole(req.user!, conversationId(req), memberId(req), role, requestContext(req)));
});

messagingRouter.post('/conversations/:id/requests/:rid/approve', async (req, res) => {
  res.json(await service.decideRequest(req.user!, conversationId(req), requestId(req), true, requestContext(req)));
});

messagingRouter.post('/conversations/:id/requests/:rid/reject', async (req, res) => {
  res.json(await service.decideRequest(req.user!, conversationId(req), requestId(req), false, requestContext(req)));
});

messagingRouter.post('/conversations/:id/cover', (req, res, next) => coverUpload(req, res, (err) => (err ? next(err) : next())), async (req, res) => {
  if (!req.file) throw badRequest('Attach the photo as "image"');
  res.json(await service.setCover(req.user!, conversationId(req), req.file.buffer, requestContext(req)));
});

messagingRouter.delete('/conversations/:id/cover', async (req, res) => {
  res.json(await service.setCover(req.user!, conversationId(req), null, requestContext(req)));
});

messagingRouter.get('/conversations/:id/cover', async (req, res) => {
  const { data, mime } = await service.coverImage(req.user!, conversationId(req));
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(data.length));
  // The URL carries the photo's version, so a private cache is safe
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(data);
});

messagingRouter.post('/conversations/:id/leave', async (req, res) => {
  await service.leave(req.user!, conversationId(req), requestContext(req));
  res.status(204).end();
});
