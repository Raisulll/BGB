import { z } from 'zod';

const userId = z.string().trim().regex(/^U\d{3,}$/, 'Invalid user id');

export const createConversationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), userId }).strict(),
  z
    .object({
      kind: z.literal('group'),
      title: z.string().trim().min(2).max(100),
      memberIds: z.array(userId).min(1).max(50),
    })
    .strict(),
]);

export const sendMessageSchema = z.object({ body: z.string().trim().min(1, 'Message is empty').max(4000) }).strict();

export const readSchema = z.object({ lastReadId: z.coerce.number().int().min(0) }).strict();

export const addMembersSchema = z.object({ userIds: z.array(userId).min(1).max(50) }).strict();

export const renameSchema = z.object({ title: z.string().trim().min(2).max(100) }).strict();

export const memberRoleSchema = z.object({ role: z.enum(['admin', 'member']) }).strict();

export const memberIdParam = userId;

export const historyQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(), // messages with id < before (older page)
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const directoryQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

export const voiceFieldsSchema = z.object({ durationMs: z.coerce.number().int().min(300).max(300_000) });
