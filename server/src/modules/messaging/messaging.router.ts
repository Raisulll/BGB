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
  readSchema,
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

const conversationId = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Conversation not found');
  return id;
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

messagingRouter.post('/conversations/:id/leave', async (req, res) => {
  await service.leave(req.user!, conversationId(req), requestContext(req));
  res.status(204).end();
});
