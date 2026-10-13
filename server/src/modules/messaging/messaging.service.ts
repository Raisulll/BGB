import { randomUUID } from 'node:crypto';
import { readObject, storage } from '../../config/storage.js';
import { prisma } from '../../db.js';
import { Prisma } from '../../generated/prisma/client.js';
import { publish } from '../../realtime/bus.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/errors.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { writeAudit } from '../audit/audit.service.js';
import { pushToUsers } from '../push/push.service.js';
import { sha256 } from '../evidence/metadata.js';
import { AUDIO_TYPES, detectAudio } from './audioType.js';
import { IMAGE_TYPES, detectImage } from './imageType.js';

// Messaging (spec #58 extension). Any active user can message any other (decision 2026-10-09);
// conversations are direct (one per pair) or groups. Messages are permanent: no edit, no delete
// (append-only triggers). Voice notes are stored encrypted through the evidence storage driver.
// Group membership changes are audited; individual messages are themselves the record.
//
// Groups have admins (the creator first). Admins add people directly, approve or reject what
// members ask to add, remove members, make or unmake admins, rename the group and set its photo.
// A member who adds someone only files a request. A group always keeps an admin: if the last one
// leaves, the longest-standing member takes over.
type AuthUser = Express.AuthUser;
type Tx = Prisma.TransactionClient;

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;

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

/** A current member of a group who is one of its admins. */
async function loadGroupAdmin(user: AuthUser, conversationId: number) {
  const m = await loadMembership(user, conversationId);
  if (m.conversation.kind !== 'group') throw forbidden('This is not a group conversation');
  if (m.role !== 'admin') throw forbidden('Only a group admin can do this');
  return m;
}

const activeAdminIds = async (conversationId: number, db: Tx | typeof prisma = prisma) =>
  (await db.conversationMember.findMany({ where: { conversationId, leftAt: null, role: 'admin' }, select: { userId: true } })).map((m) => m.userId);

const activeMemberIds = async (conversationId: number, db: Tx | typeof prisma = prisma) =>
  (await db.conversationMember.findMany({ where: { conversationId, leftAt: null }, select: { userId: true } })).map((m) => m.userId);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
const messageInclude = {
  sender: { select: { id: true, name: true } },
  call: { select: { id: true, status: true, callerId: true, calleeId: true, answeredAt: true, endedAt: true, endReason: true } },
} as const;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

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
    // A finished call between the two people (the sender is the caller)
    call: m.call
      ? {
          id: m.call.id,
          status: m.call.status,
          callerId: m.call.callerId,
          calleeId: m.call.calleeId,
          durationSeconds: m.call.answeredAt && m.call.endedAt ? Math.round((m.call.endedAt.getTime() - m.call.answeredAt.getTime()) / 1000) : null,
          endReason: m.call.endReason,
        }
      : null,
  };
}

export async function messageDto(messageId: number) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  return m ? toMessageDto(m) : null;
}

/** One conversation as the given user sees it: title, members, last message, unread count. */
async function conversationDto(userId: string, conversationId: number) {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      members: { where: { leftAt: null }, include: { user: { select: userSelect } }, orderBy: { joinedAt: 'asc' } },
      messages: { orderBy: { id: 'desc' }, take: 1, include: messageInclude },
    },
  });
  const me = await prisma.conversationMember.findUniqueOrThrow({ where: { conversationId_userId: { conversationId, userId } } });
  const unread = await prisma.message.count({ where: { conversationId, id: { gt: me.lastReadId }, senderId: { not: userId } } });
  const others = c.members.filter((m) => m.userId !== userId).map((m) => m.user);
  const isAdmin = c.kind === 'group' && me.role === 'admin';
  // Admins see every open request; a member sees the ones they filed
  const requests =
    c.kind === 'group'
      ? await prisma.conversationJoinRequest.findMany({
          where: { conversationId, status: 'pending', ...(isAdmin ? {} : { requestedBy: userId }) },
          include: { user: { select: userSelect }, requester: { select: { id: true, name: true } } },
          orderBy: { id: 'asc' },
        })
      : [];
  return {
    id: c.id,
    kind: c.kind,
    // Direct conversations are titled by the other person
    title: c.kind === 'group' ? c.title : (others[0]?.name ?? ''),
    members: c.members.map((m) => ({ ...m.user, groupRole: c.kind === 'group' ? m.role : null })),
    myRole: c.kind === 'group' ? me.role : null,
    coverUrl: c.coverPath && c.coverUpdatedAt ? `/api/v1/messaging/conversations/${c.id}/cover?v=${c.coverUpdatedAt.getTime()}` : null,
    pendingRequests: requests.map((r) => ({ id: r.id, user: r.user, requestedBy: r.requester, createdAt: r.createdAt.toISOString() })),
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
    include: messageInclude,
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
      data: {
        kind: 'group',
        title: input.title,
        createdBy: user.id,
        members: { create: [{ userId: user.id, role: 'admin' }, ...memberIds.map((userId) => ({ userId }))] },
      },
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

async function afterMessage(conversationId: number, messageId: number, sender: AuthUser, voice: boolean) {
  const recipients = await activeMemberIds(conversationId);
  await publish({ type: 'message.new', conversationId, messageId, recipients });
  // Devices where BIRDS is closed: who wrote, never the text (see push.service.ts)
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { kind: true, title: true } });
  void pushToUsers(
    recipients.filter((id) => id !== sender.id),
    { kind: 'message', conversationId, senderName: sender.name, groupTitle: conv?.kind === 'group' ? conv.title : null, voice },
    { ttlSeconds: 24 * 3600, urgency: 'normal', topic: `conv-${conversationId}` },
  );
}

export async function sendText(user: AuthUser, conversationId: number, body: string) {
  await loadMembership(user, conversationId);
  const m = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({ data: { conversationId, senderId: user.id, kind: 'text', body }, include: messageInclude });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
    // Sending implies having read everything up to it
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadId: msg.id } });
    return msg;
  });
  await afterMessage(conversationId, m.id, user, false);
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
        include: messageInclude,
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
      await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadId: msg.id } });
      return msg;
    });
    await afterMessage(conversationId, m.id, user, true);
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

/**
 * Adds people to a group. An admin adds them at once; a member's additions become requests for
 * an admin to approve (people already asked for are skipped).
 */
export async function addMembers(user: AuthUser, conversationId: number, userIds: string[], ctx: RequestContext) {
  const m = await loadMembership(user, conversationId);
  if (m.conversation.kind !== 'group') throw forbidden('People can only be added to group conversations');
  const current = await activeMemberIds(conversationId);
  const wanted = [...new Set(userIds)].filter((id) => !current.includes(id));
  if (wanted.length === 0) return { conversation: await conversationDto(user.id, conversationId), added: [], requested: [] };
  await assertActiveUsers(wanted);

  if (m.role === 'admin') {
    await addToGroup(user, conversationId, wanted, current);
    await writeAudit({ action: 'MESSAGE_GROUP_ADD', username: user.username, userId: user.id, details: `Added ${wanted.join(', ')} to group #${conversationId}`, ctx });
    return { conversation: await conversationDto(user.id, conversationId), added: wanted, requested: [] };
  }

  const open = await prisma.conversationJoinRequest.findMany({ where: { conversationId, status: 'pending', userId: { in: wanted } }, select: { userId: true } });
  const toRequest = wanted.filter((id) => !open.some((r) => r.userId === id));
  if (toRequest.length) {
    const names = await prisma.user.findMany({ where: { id: { in: toRequest } }, select: { name: true } });
    const admins = await activeAdminIds(conversationId);
    await prisma.$transaction(async (tx) => {
      await tx.conversationJoinRequest.createMany({ data: toRequest.map((id) => ({ conversationId, userId: id, requestedBy: user.id })) });
      await tx.notification.createMany({
        data: admins.map((adminId) => ({
          userId: adminId,
          title: 'Group join request',
          message: `${user.name} asked to add ${names.map((n) => n.name).join(', ')} to "${m.conversation.title}"`,
          type: 'group',
          conversationId,
        })),
      });
    });
    await writeAudit({ action: 'MESSAGE_GROUP_REQUEST', username: user.username, userId: user.id, details: `Asked to add ${toRequest.join(', ')} to group #${conversationId}`, ctx });
    await publish({ type: 'conversation.changed', conversationId, recipients: [user.id, ...admins] });
  }
  return { conversation: await conversationDto(user.id, conversationId), added: [], requested: toRequest };
}

/** Makes people members (rejoining reuses the row: they see the history from the start). */
async function addToGroup(actor: AuthUser, conversationId: number, ids: string[], current: string[], note?: string) {
  const names = await prisma.user.findMany({ where: { id: { in: ids } }, select: { name: true } });
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await tx.conversationMember.upsert({
        where: { conversationId_userId: { conversationId, userId: id } },
        update: { leftAt: null, removedBy: null, role: 'member' },
        create: { conversationId, userId: id },
      });
    }
    // Anything still asked for these people is settled by this
    await tx.conversationJoinRequest.updateMany({
      where: { conversationId, status: 'pending', userId: { in: ids } },
      data: { status: 'approved', decidedBy: actor.id, decidedAt: new Date() },
    });
    await systemMessage(tx, conversationId, actor.id, `${actor.name} added ${names.map((n) => n.name).join(', ')}${note ?? ''}`);
  });
  await publish({ type: 'conversation.changed', conversationId, recipients: [...current, ...ids] });
}

/** An admin approves or rejects a request to add someone. */
export async function decideRequest(user: AuthUser, conversationId: number, requestId: number, approve: boolean, ctx: RequestContext) {
  await loadGroupAdmin(user, conversationId);
  const r = await prisma.conversationJoinRequest.findFirst({
    where: { id: requestId, conversationId },
    include: { user: { select: { id: true, name: true, isActive: true } }, requester: { select: { id: true, name: true } } },
  });
  if (!r) throw notFound('Request not found');
  if (r.status !== 'pending') throw new AppError(409, 'ALREADY_DECIDED', 'This request has already been decided');
  const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { title: true } });
  const current = await activeMemberIds(conversationId);

  if (approve && r.user.isActive && !current.includes(r.userId)) {
    await addToGroup(user, conversationId, [r.userId], current, ` (asked by ${r.requester.name})`);
  } else {
    // Rejected, or no longer possible (already a member, account deactivated)
    const { count } = await prisma.conversationJoinRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: approve ? 'cancelled' : 'rejected', decidedBy: user.id, decidedAt: new Date() },
    });
    if (!count) throw new AppError(409, 'ALREADY_DECIDED', 'This request has already been decided');
  }
  if (r.requestedBy !== user.id) {
    await prisma.notification.create({
      data: {
        userId: r.requestedBy,
        title: approve ? 'Join request approved' : 'Join request declined',
        message: `${user.name} ${approve ? 'approved' : 'declined'} adding ${r.user.name} to "${conv.title}"`,
        type: 'group',
        conversationId,
      },
    });
  }
  await writeAudit({
    action: approve ? 'MESSAGE_GROUP_APPROVE' : 'MESSAGE_GROUP_REJECT',
    username: user.username,
    userId: user.id,
    details: `${approve ? 'Approved' : 'Rejected'} request #${r.id} (${r.requestedBy} to add ${r.userId}) in group #${conversationId}`,
    ctx,
  });
  await publish({ type: 'conversation.changed', conversationId, recipients: [...new Set([...(await activeAdminIds(conversationId)), r.requestedBy, user.id])] });
  return conversationDto(user.id, conversationId);
}

/** An admin removes a member. Use leave for yourself. */
export async function removeMember(user: AuthUser, conversationId: number, targetId: string, ctx: RequestContext) {
  await loadGroupAdmin(user, conversationId);
  if (targetId === user.id) throw badRequest('Use Leave group to leave');
  const target = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: targetId } }, include: { user: { select: { name: true } } } });
  if (!target || target.leftAt) throw notFound('Not a member of this group');
  const recipients = await activeMemberIds(conversationId);
  await prisma.$transaction(async (tx) => {
    await systemMessage(tx, conversationId, user.id, `${user.name} removed ${target.user.name}`);
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetId } },
      data: { leftAt: new Date(), removedBy: user.id, role: 'member' },
    });
  });
  await writeAudit({ action: 'MESSAGE_GROUP_REMOVE', username: user.username, userId: user.id, details: `Removed ${targetId} from group #${conversationId}`, ctx });
  await publish({ type: 'conversation.changed', conversationId, recipients });
  return conversationDto(user.id, conversationId);
}

/** An admin makes a member an admin, or an admin a member (a group keeps at least one admin). */
export async function setMemberRole(user: AuthUser, conversationId: number, targetId: string, role: 'admin' | 'member', ctx: RequestContext) {
  await loadGroupAdmin(user, conversationId);
  const target = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: targetId } }, include: { user: { select: { name: true } } } });
  if (!target || target.leftAt) throw notFound('Not a member of this group');
  if (target.role === role) return conversationDto(user.id, conversationId);
  if (role === 'member' && (await activeAdminIds(conversationId)).length <= 1) throw new AppError(409, 'LAST_ADMIN', 'A group needs at least one admin');
  await prisma.$transaction(async (tx) => {
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: targetId } }, data: { role } });
    await systemMessage(tx, conversationId, user.id, role === 'admin' ? `${user.name} made ${target.user.name} an admin` : `${user.name} removed ${target.user.name} as admin`);
  });
  await writeAudit({ action: 'MESSAGE_GROUP_ROLE', username: user.username, userId: user.id, details: `Set ${targetId} to ${role} in group #${conversationId}`, ctx });
  await publish({ type: 'conversation.changed', conversationId, recipients: await activeMemberIds(conversationId) });
  return conversationDto(user.id, conversationId);
}

export async function renameGroup(user: AuthUser, conversationId: number, title: string, ctx: RequestContext) {
  const m = await loadGroupAdmin(user, conversationId);
  if (m.conversation.title === title) return conversationDto(user.id, conversationId);
  await prisma.$transaction(async (tx) => {
    await tx.conversation.update({ where: { id: conversationId }, data: { title } });
    await systemMessage(tx, conversationId, user.id, `${user.name} renamed the group to "${title}"`);
  });
  await writeAudit({ action: 'MESSAGE_GROUP_RENAME', username: user.username, userId: user.id, details: `Renamed group #${conversationId} from "${m.conversation.title}" to "${title}"`, ctx });
  await publish({ type: 'conversation.changed', conversationId, recipients: await activeMemberIds(conversationId) });
  return conversationDto(user.id, conversationId);
}

/** Sets (file) or removes (null) the group photo: JPEG, PNG or WebP, stored encrypted. */
export async function setCover(user: AuthUser, conversationId: number, file: Buffer | null, ctx: RequestContext) {
  const m = await loadGroupAdmin(user, conversationId);
  let next: { coverPath: string | null; coverMime: string | null; coverSha256: string | null; coverUpdatedAt: Date | null } = {
    coverPath: null,
    coverMime: null,
    coverSha256: null,
    coverUpdatedAt: null,
  };
  if (file) {
    if (file.length > MAX_COVER_BYTES) throw new AppError(413, 'LIMIT_FILE_SIZE', 'The photo is too large (2 MB at most)');
    const mime = detectImage(file);
    if (!mime) {
      await writeAudit({ action: 'UPLOAD_REJECTED', username: user.username, userId: user.id, details: `Group photo for #${conversationId}: not a JPEG, PNG or WebP image`, ctx });
      throw new AppError(415, 'UNSUPPORTED_TYPE', 'The group photo must be a JPEG, PNG or WebP image');
    }
    const key = `groups/${conversationId}/${randomUUID()}${IMAGE_TYPES[mime]}`;
    await storage.put(key, file);
    next = { coverPath: key, coverMime: mime, coverSha256: sha256(file), coverUpdatedAt: new Date() };
  } else if (!m.conversation.coverPath) {
    return conversationDto(user.id, conversationId);
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id: conversationId }, data: next });
      await systemMessage(tx, conversationId, user.id, file ? `${user.name} changed the group photo` : `${user.name} removed the group photo`);
    });
  } catch (err) {
    if (next.coverPath) await storage.remove(next.coverPath).catch(() => {});
    throw err;
  }
  // The old photo isn't needed any more (the change itself is in the audit log)
  if (m.conversation.coverPath) await storage.remove(m.conversation.coverPath).catch(() => {});
  await writeAudit({
    action: 'MESSAGE_GROUP_COVER',
    username: user.username,
    userId: user.id,
    details: file ? `Set the photo of group #${conversationId} (${next.coverMime}, ${file.length} bytes, SHA-256 ${next.coverSha256})` : `Removed the photo of group #${conversationId}`,
    ctx,
  });
  await publish({ type: 'conversation.changed', conversationId, recipients: await activeMemberIds(conversationId) });
  return conversationDto(user.id, conversationId);
}

/** The group photo, for members only, integrity-checked. */
export async function coverImage(user: AuthUser, conversationId: number) {
  const m = await loadMembership(user, conversationId);
  const c = m.conversation;
  if (!c.coverPath) throw notFound('This group has no photo');
  let object;
  try {
    object = await readObject(c.coverPath);
  } catch {
    throw new AppError(409, 'EVIDENCE_TAMPERED', 'The group photo failed its integrity check');
  }
  if (!object) throw new AppError(404, 'FILE_UNAVAILABLE', 'The group photo is not in storage');
  if (c.coverSha256 && sha256(object.data) !== c.coverSha256) throw new AppError(409, 'EVIDENCE_TAMPERED', 'The group photo failed its integrity check');
  return { data: object.data, mime: c.coverMime ?? 'application/octet-stream' };
}

export async function leave(user: AuthUser, conversationId: number, ctx: RequestContext) {
  const m = await loadMembership(user, conversationId);
  if (m.conversation.kind !== 'group') throw forbidden('You can only leave group conversations');
  const recipients = await activeMemberIds(conversationId);
  await prisma.$transaction(async (tx) => {
    await systemMessage(tx, conversationId, user.id, `${user.name} left the group`);
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { leftAt: new Date(), role: 'member' } });
    // The last admin leaving hands the group to the longest-standing member
    if (m.role === 'admin' && (await activeAdminIds(conversationId, tx)).length === 0) {
      const next = await tx.conversationMember.findFirst({
        where: { conversationId, leftAt: null },
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        include: { user: { select: { name: true } } },
      });
      if (next) {
        await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: next.userId } }, data: { role: 'admin' } });
        await systemMessage(tx, conversationId, next.userId, `${next.user.name} is now an admin`);
      }
    }
  });
  await writeAudit({ action: 'MESSAGE_GROUP_LEAVE', username: user.username, userId: user.id, details: `Left group #${conversationId}`, ctx });
  await publish({ type: 'conversation.changed', conversationId, recipients });
}
