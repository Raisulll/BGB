import { randomUUID } from 'node:crypto';
import { readObject, storage } from '../../config/storage.js';
import { prisma } from '../../db.js';
import { Prisma } from '../../generated/prisma/client.js';
import { publish } from '../../realtime/bus.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { writeAudit } from '../audit/audit.service.js';
import { sha256 } from '../evidence/metadata.js';
import { AUDIO_TYPES, detectAudio } from './audioType.js';

// Messaging (spec #58 extension). Any active user can message any other (decision 2026-10-09);
// conversations are direct (one per pair) or groups. Messages are permanent: no edit, no delete
// (append-only triggers). Voice notes are stored encrypted through the evidence storage driver.
// Group membership changes are audited; individual messages are themselves the record.
type AuthUser = Express.AuthUser;
type Tx = Prisma.TransactionClient;

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;

const userSelect = { id: true, name: true, role: true, scope: true } as const;

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------
/** The conversation, if the user is a current member; otherwise 404 (existence isn't leaked). */
async function loadMembership(user: AuthUser, conversationId: number) {
  const m = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    include: { conversation: true },
  });
  if (!m || m.leftAt) throw notFound('Conversation not found');
  return m;
}

const activeMemberIds = async (conversationId: number, db: Tx | typeof prisma = prisma) =>
  (await db.conversationMember.findMany({ where: { conversationId, leftAt: null }, select: { userId: true } })).map((m) => m.userId);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
type MessageRow = Prisma.MessageGetPayload<{ include: { sender: { select: { id: true; name: true } } } }>;

export function toMessageDto(m: MessageRow) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: m.kind,
    body: m.body,
    sender: { id: m.sender.id, name: m.sender.name },
    createdAt: m.createdAt.toISOString(),
    voice:
      m.kind === 'voice'
        ? {
            mime: m.voiceMime,
            size: m.voiceSize,
            durationMs: m.voiceDurationMs,
            url: `/api/v1/messaging/conversations/${m.conversationId}/messages/${m.id}/audio`,
          }
        : null,
  };
}

export async function messageDto(messageId: number) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: { sender: { select: { id: true, name: true } } } });
  return m ? toMessageDto(m) : null;
}

/** One conversation as the given user sees it: title, members, last message, unread count. */
async function conversationDto(userId: string, conversationId: number) {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      members: { where: { leftAt: null }, include: { user: { select: userSelect } }, orderBy: { joinedAt: 'asc' } },
      messages: { orderBy: { id: 'desc' }, take: 1, include: { sender: { select: { id: true, name: true } } } },
    },
  });
  const me = await prisma.conversationMember.findUniqueOrThrow({ where: { conversationId_userId: { conversationId, userId } } });
  const unread = await prisma.message.count({ where: { conversationId, id: { gt: me.lastReadId }, senderId: { not: userId } } });
  const others = c.members.filter((m) => m.userId !== userId).map((m) => m.user);
  return {
    id: c.id,
    kind: c.kind,
    // Direct conversations are titled by the other person
    title: c.kind === 'group' ? c.title : (others[0]?.name ?? ''),
    members: c.members.map((m) => m.user),
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    lastMessage: c.messages[0] ? toMessageDto(c.messages[0]) : null,
    lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
    unread,
    lastReadId: me.lastReadId,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
/** Everyone the user can message: all other active users (search by name, username or unit). */
export async function directory(user: AuthUser, q?: string) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: user.id },
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }, { scope: { contains: q, mode: 'insensitive' } }] }
        : {}),
    },
    select: userSelect,
    orderBy: { name: 'asc' },
    take: 100,
  });
}

export async function listConversations(user: AuthUser) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: user.id, leftAt: null },
    select: { conversationId: true },
  });
  const list = await Promise.all(memberships.map((m) => conversationDto(user.id, m.conversationId)));
  return list.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function getConversation(user: AuthUser, conversationId: number) {
  await loadMembership(user, conversationId);
  return conversationDto(user.id, conversationId);
}

export async function history(user: AuthUser, conversationId: number, before: number | undefined, limit: number) {
  await loadMembership(user, conversationId);
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: 'desc' },
    take: limit,
    include: { sender: { select: { id: true, name: true } } },
  });
  return { messages: rows.reverse().map(toMessageDto), hasMore: rows.length === limit };
}

export async function unreadTotal(user: AuthUser) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
      FROM messages m
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${user.id} AND cm.left_at IS NULL
     WHERE m.id > cm.last_read_id AND m.sender_id <> ${user.id}`;
  return { unread: Number(rows[0]?.n ?? 0) };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function assertActiveUsers(ids: string[]) {
  const found = await prisma.user.count({ where: { id: { in: ids }, isActive: true } });
  if (found !== new Set(ids).size) throw badRequest('One or more users do not exist or are deactivated');
}

async function systemMessage(tx: Tx, conversationId: number, senderId: string, body: string) {
  const m = await tx.message.create({ data: { conversationId, senderId, kind: 'system', body } });
  await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
  return m;
}

export async function createConversation(
  user: AuthUser,
  input: { kind: 'direct'; userId: string } | { kind: 'group'; title: string; memberIds: string[] },
  ctx: RequestContext,
) {
  if (input.kind === 'direct') {
    if (input.userId === user.id) throw badRequest("You can't start a conversation with yourself");
    await assertActiveUsers([input.userId]);
    const directKey = [user.id, input.userId].sort().join(':');
    const existing = await prisma.conversation.findUnique({ where: { directKey } });
    if (existing) return conversationDto(user.id, existing.id);
    try {
      const c = await prisma.conversation.create({
        data: {
          kind: 'direct',
          directKey,
          createdBy: user.id,
          members: { create: [{ userId: user.id }, { userId: input.userId }] },
        },
      });
      return conversationDto(user.id, c.id);
    } catch (err) {
      // Both people opened the thread at the same moment: use the one that won
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const c = await prisma.conversation.findUniqueOrThrow({ where: { directKey } });
        return conversationDto(user.id, c.id);
      }
      throw err;
    }
  }

  const memberIds = [...new Set(input.memberIds.filter((id) => id !== user.id))];
  if (memberIds.length === 0) throw badRequest('Add at least one other member');
  await assertActiveUsers(memberIds);
  const names = await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { name: true } });
  const c = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.create({
      data: { kind: 'group', title: input.title, createdBy: user.id, members: { create: [user.id, ...memberIds].map((userId) => ({ userId })) } },
    });
    await systemMessage(tx, conv.id, user.id, `${user.name} created the group "${input.title}" with ${names.map((n) => n.name).join(', ')}`);
    return conv;
  });
  await writeAudit({
    action: 'MESSAGE_GROUP_CREATE',
    username: user.username,
    userId: user.id,
    details: `Created group #${c.id} "${input.title}" with ${memberIds.join(', ')}`,
    ctx,
  });
  await publish({ type: 'conversation.changed', conversationId: c.id, recipients: [user.id, ...memberIds] });
  return conversationDto(user.id, c.id);
}

async function afterMessage(conversationId: number, messageId: number) {
  await publish({ type: 'message.new', conversationId, messageId, recipients: await activeMemberIds(conversationId) });
}

export async function sendText(user: AuthUser, conversationId: number, body: string) {
  await loadMembership(user, conversationId);
  const m = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({ data: { conversationId, senderId: user.id, kind: 'text', body }, include: { sender: { select: { id: true, name: true } } } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
    // Sending implies having read everything up to it
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadId: msg.id } });
    return msg;
  });
  await afterMessage(conversationId, m.id);
  return toMessageDto(m);
}

export async function sendVoice(user: AuthUser, conversationId: number, file: Buffer, durationMs: number, ctx: RequestContext) {
  await loadMembership(user, conversationId);
  if (file.length > MAX_VOICE_BYTES) throw new AppError(413, 'LIMIT_FILE_SIZE', 'Voice message is too large');
  const mime = detectAudio(file);
  if (!mime) {
    await writeAudit({ action: 'UPLOAD_REJECTED', username: user.username, userId: user.id, details: `Voice message to conversation #${conversationId}: not a recognised audio file`, ctx });
    throw new AppError(415, 'UNSUPPORTED_TYPE', 'Voice messages must be WebM, Ogg, MP4/M4A or MP3 audio');
  }
  const key = `messages/${conversationId}/${randomUUID()}${AUDIO_TYPES[mime]}`;
  await storage.put(key, file);
  try {
    const m = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { conversationId, senderId: user.id, kind: 'voice', voicePath: key, voiceMime: mime, voiceSize: file.length, voiceDurationMs: durationMs, voiceSha256: sha256(file) },
        include: { sender: { select: { id: true, name: true } } },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
      await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadId: msg.id } });
      return msg;
    });
    await afterMessage(conversationId, m.id);
    return toMessageDto(m);
  } catch (err) {
    await storage.remove(key).catch(() => {});
    throw err;
  }
}

/** The audio of a voice message, for members only. Integrity is checked like evidence. */
export async function voiceAudio(user: AuthUser, conversationId: number, messageId: number) {
  await loadMembership(user, conversationId);
  const m = await prisma.message.findFirst({ where: { id: messageId, conversationId, kind: 'voice' } });
  if (!m?.voicePath) throw notFound('Voice message not found');
  let object;
  try {
    object = await readObject(m.voicePath);
  } catch {
    throw new AppError(409, 'EVIDENCE_TAMPERED', 'This voice message failed its integrity check');
  }
  if (!object) throw new AppError(404, 'FILE_UNAVAILABLE', 'The audio for this message is not in storage');
  if (m.voiceSha256 && sha256(object.data) !== m.voiceSha256) throw new AppError(409, 'EVIDENCE_TAMPERED', 'This voice message failed its integrity check');
  return { data: object.data, mime: m.voiceMime ?? 'application/octet-stream' };
}

export async function markRead(user: AuthUser, conversationId: number, lastReadId: number) {
  await loadMembership(user, conversationId);
  const latest = await prisma.message.findFirst({ where: { conversationId }, orderBy: { id: 'desc' }, select: { id: true } });
  const target = Math.min(lastReadId, latest?.id ?? 0);
  // Only ever moves forward
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: user.id, lastReadId: { lt: target } },
    data: { lastReadId: target },
  });
  await publish({ type: 'read', conversationId, userId: user.id });
  return conversationDto(user.id, conversationId);
}

export async function addMembers(user: AuthUser, conversationId: number, userIds: string[], ctx: RequestContext) {
  const m = await loadMembership(user, conversationId);
  if (m.conversation.kind !== 'group') throw forbidden('People can only be added to group conversations');
  const current = await activeMemberIds(conversationId);
  const toAdd = [...new Set(userIds)].filter((id) => !current.includes(id));
  if (toAdd.length === 0) return conversationDto(user.id, conversationId);
  await assertActiveUsers(toAdd);
  const names = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { name: true } });
  await prisma.$transaction(async (tx) => {
    for (const id of toAdd) {
      // Rejoining after leaving reuses the row; they see the history from the start
      await tx.conversationMember.upsert({
        where: { conversationId_userId: { conversationId, userId: id } },
        update: { leftAt: null },
        create: { conversationId, userId: id },
      });
    }
    await systemMessage(tx, conversationId, user.id, `${user.name} added ${names.map((n) => n.name).join(', ')}`);
  });
  await writeAudit({ action: 'MESSAGE_GROUP_ADD', username: user.username, userId: user.id, details: `Added ${toAdd.join(', ')} to group #${conversationId}`, ctx });
  await publish({ type: 'conversation.changed', conversationId, recipients: [...current, ...toAdd] });
  return conversationDto(user.id, conversationId);
}

export async function leave(user: AuthUser, conversationId: number, ctx: RequestContext) {
  const m = await loadMembership(user, conversationId);
  if (m.conversation.kind !== 'group') throw forbidden('You can only leave group conversations');
  const recipients = await activeMemberIds(conversationId);
  await prisma.$transaction(async (tx) => {
    await systemMessage(tx, conversationId, user.id, `${user.name} left the group`);
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { leftAt: new Date() } });
  });
  await writeAudit({ action: 'MESSAGE_GROUP_LEAVE', username: user.username, userId: user.id, details: `Left group #${conversationId}`, ctx });
  await publish({ type: 'conversation.changed', conversationId, recipients });
}
