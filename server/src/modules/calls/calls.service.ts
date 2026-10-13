import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db.js';
import { Prisma } from '../../generated/prisma/client.js';
import { publish } from '../../realtime/bus.js';
import { paged, toSkipTake } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { writeAudit } from '../audit/audit.service.js';

// 1:1 audio calls (spec #58 extension). The server never touches audio: browsers connect with
// WebRTC and the server only relays the connection set-up and keeps the call record. One audit
// entry per finished call; a missed call also notifies the person who missed it.
export type CallStatus = 'ringing' | 'answered' | 'ended' | 'declined' | 'missed' | 'cancelled' | 'failed';
const ACTIVE: CallStatus[] = ['ringing', 'answered'];

const party = { select: { id: true, name: true, username: true, role: true, scope: true } } as const;
type CallRow = Prisma.CallGetPayload<{ include: { caller: typeof party; callee: typeof party } }>;

export function toCallDto(c: CallRow, viewerId?: string) {
  const duration = c.answeredAt && c.endedAt ? Math.round((c.endedAt.getTime() - c.answeredAt.getTime()) / 1000) : null;
  return {
    id: c.id,
    status: c.status,
    caller: c.caller,
    callee: c.callee,
    direction: viewerId ? (c.callerId === viewerId ? 'outgoing' : 'incoming') : undefined,
    other: viewerId ? (c.callerId === viewerId ? c.callee : c.caller) : undefined,
    startedAt: c.startedAt.toISOString(),
    answeredAt: c.answeredAt?.toISOString() ?? null,
    endedAt: c.endedAt?.toISOString() ?? null,
    durationSeconds: duration,
    endReason: c.endReason,
  };
}

/** ICE servers for the browser's RTCPeerConnection. */
export function iceServers() {
  const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const servers: { urls: string[]; username?: string; credential?: string }[] = [];
  if (list(env.STUN_URLS).length) servers.push({ urls: list(env.STUN_URLS) });
  if (list(env.TURN_URLS).length) servers.push({ urls: list(env.TURN_URLS), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  return { iceServers: servers, relay: list(env.TURN_URLS).length > 0 };
}

export const getCall = (id: number) => prisma.call.findUnique({ where: { id }, include: { caller: party, callee: party } });

export async function isBusy(userId: string) {
  return (await prisma.call.count({ where: { status: { in: ACTIVE }, OR: [{ callerId: userId }, { calleeId: userId }] } })) > 0;
}

export async function createCall(callerId: string, calleeId: string, status: CallStatus = 'ringing', endReason?: string) {
  return prisma.call.create({
    data: { callerId, calleeId, status, endReason, ...(status !== 'ringing' ? { endedAt: new Date() } : {}) },
    include: { caller: party, callee: party },
  });
}

/**
 * Moves a call between states only from the expected one (so two racing updates can't both win).
 * Returns the updated call, or null if it was no longer in `from`.
 */
export async function transition(id: number, from: CallStatus[], to: CallStatus, endReason?: string) {
  const now = new Date();
  const data: Prisma.CallUpdateManyMutationInput = { status: to };
  if (to === 'answered') data.answeredAt = now;
  else data.endedAt = now;
  if (endReason) data.endReason = endReason;
  const { count } = await prisma.call.updateMany({ where: { id, status: { in: from } }, data });
  return count ? getCall(id) : null;
}

/** After a call reaches a final state: audit, and tell the callee about a missed call. */
export async function finalise(call: CallRow, ctx: RequestContext) {
  const dto = toCallDto(call);
  const summary =
    call.status === 'ended'
      ? `answered, ${dto.durationSeconds ?? 0} s`
      : call.status + (call.endReason ? ` (${call.endReason})` : '');
  await writeAudit({
    action: 'CALL',
    username: call.caller.username,
    userId: call.callerId,
    details: `Call #${call.id} ${call.caller.name} → ${call.callee.name}: ${summary}`,
    ctx,
  });
  if (call.status === 'missed') {
    await prisma.notification.create({
      data: { userId: call.calleeId, title: 'Missed Call', message: `Missed call from ${call.caller.name}`, type: 'call' },
    });
  }
  await recordInChat(call);
}

/** Plain wording kept in a call entry's message body (the UI words it from the call itself). */
export function callSummary(call: { status: string; endReason: string | null; answeredAt: Date | null; endedAt: Date | null }) {
  if (call.status === 'ended') {
    const secs = call.answeredAt && call.endedAt ? Math.round((call.endedAt.getTime() - call.answeredAt.getTime()) / 1000) : 0;
    return `Call, ${secs} s`;
  }
  if (call.status === 'failed' && call.endReason === 'busy') return 'Call not connected (busy)';
  return ({ missed: 'Missed call', declined: 'Call declined', cancelled: 'Call cancelled', failed: 'Call not connected' } as Record<string, string>)[call.status] ?? 'Call';
}

/**
 * The finished call as an entry in the two people's direct conversation (opened if they had none).
 * The caller "sent" it and has read it; the callee has read it only if they answered or declined,
 * so a missed call is unread for them. Never fails the call: the call record stays the source.
 */
async function recordInChat(call: CallRow) {
  try {
    const directKey = [call.callerId, call.calleeId].sort().join(':');
    const conv =
      (await prisma.conversation.findUnique({ where: { directKey } })) ??
      (await prisma.conversation
        .create({ data: { kind: 'direct', directKey, createdBy: call.callerId, members: { create: [{ userId: call.callerId }, { userId: call.calleeId }] } } })
        .catch(async (err) => {
          // Both people opened the thread at the same moment: use the one that won
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return prisma.conversation.findUniqueOrThrow({ where: { directKey } });
          throw err;
        }));
    const conversationId = conv.id;
    const seenByCallee = call.status === 'ended' || call.status === 'declined';
    const msg = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId, senderId: call.callerId, kind: 'call', body: callSummary(call), callId: call.id } });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
      const readers = seenByCallee ? [call.callerId, call.calleeId] : [call.callerId];
      await tx.conversationMember.updateMany({ where: { conversationId, userId: { in: readers }, lastReadId: { lt: m.id } }, data: { lastReadId: m.id } });
      return m;
    });
    await publish({ type: 'message.new', conversationId, messageId: msg.id, recipients: [call.callerId, call.calleeId] });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return; // already recorded
    logger.error('Could not add a call to the chat', { callId: call.id, error: (err as Error).message });
  }
}

/** Own call log, newest first. */
export async function myCalls(user: Express.AuthUser, page: number, pageSize: number) {
  const where: Prisma.CallWhereInput = { OR: [{ callerId: user.id }, { calleeId: user.id }] };
  const [rows, total] = await prisma.$transaction([
    prisma.call.findMany({ where, include: { caller: party, callee: party }, orderBy: { startedAt: 'desc' }, ...toSkipTake({ page, pageSize }) }),
    prisma.call.count({ where }),
  ]);
  return paged(rows.map((c) => toCallDto(c, user.id)), total, { page, pageSize });
}

/** Every call (administrators and auditors), optionally for one user. */
export async function allCalls(page: number, pageSize: number, userId?: string) {
  const where: Prisma.CallWhereInput = userId ? { OR: [{ callerId: userId }, { calleeId: userId }] } : {};
  const [rows, total] = await prisma.$transaction([
    prisma.call.findMany({ where, include: { caller: party, callee: party }, orderBy: { startedAt: 'desc' }, ...toSkipTake({ page, pageSize }) }),
    prisma.call.count({ where }),
  ]);
  return paged(rows.map((c) => toCallDto(c)), total, { page, pageSize });
}

/** Startup clean-up: calls left ringing by a restart are missed; very old open calls are closed. */
export async function sweepStaleCalls() {
  const now = Date.now();
  await prisma.call.updateMany({ where: { status: 'ringing', startedAt: { lt: new Date(now - 60_000) } }, data: { status: 'missed', endedAt: new Date(), endReason: 'interrupted' } });
  await prisma.call.updateMany({ where: { status: 'answered', answeredAt: { lt: new Date(now - 12 * 3_600_000) } }, data: { status: 'ended', endedAt: new Date(), endReason: 'stale' } });
}
