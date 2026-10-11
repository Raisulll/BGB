import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db.js';
import { publish } from '../../realtime/bus.js';
import { onClientClose, onClientMessage, onClientReady, onEvent, type Client } from '../../realtime/hub.js';
import { pushToUsers } from '../push/push.service.js';
import { createCall, finalise, getCall, isBusy, toCallDto, transition } from './calls.service.js';

// Call signalling over the realtime channel. Flow:
//   caller  call.invite {to}        -> server records "ringing", callee gets call.incoming
//   callee  call.accept {callId}    -> "answered"; caller gets call.accepted and sends the WebRTC offer
//   either  call.signal {callId, data} (offer / answer / ICE candidates) -> relayed to the other party
//   either  call.end / call.decline / call.cancel -> final state, both sides get call.ended
// Unanswered calls are missed after CALL_RING_SECONDS. When a participant's socket closes, the call
// waits CALL_RECONNECT_SECONDS for that user to reconnect and send call.resume {callId}; only then
// does it end as "connection lost". The audio is browser to browser and survives a signalling blip.
const RING_MS = env.CALL_RING_SECONDS * 1000;
const RECONNECT_MS = env.CALL_RECONNECT_SECONDS * 1000;

const tracked = new WeakMap<Client, Set<number>>(); // calls each socket is part of
const track = (c: Client, id: number) => (tracked.get(c) ?? tracked.set(c, new Set()).get(c)!).add(id);
const untrack = (c: Client, id: number) => tracked.get(c)?.delete(id);

// Calls waiting for a dropped participant, by "callId:userId". The resume may reach another process
// (PM2 cluster), so it is announced on the bus and every process clears its own timer.
const dropped = new Map<string, NodeJS.Timeout>();
const droppedKey = (callId: number, userId: string) => `${callId}:${userId}`;

const toUser = (to: string, payload: Record<string, unknown>) => publish({ type: 'call', to, payload });
const reply = (c: Client, payload: Record<string, unknown>) => c.ws.send(JSON.stringify(payload));

async function ended(callId: number, ctx: Client['ctx']) {
  const call = await getCall(callId);
  if (!call) return;
  await finalise(call, ctx);
  const payload = { type: 'call.ended', callId, status: call.status, reason: call.endReason };
  await toUser(call.callerId, payload);
  await toUser(call.calleeId, payload);
  // A call that was never answered becomes a "Missed call" notification on the callee's devices
  // (it replaces the ringing one). Answered or declined calls send nothing: the ringing
  // notification closes itself when the ring time is over, or when the app opens.
  if (!call.answeredAt && (call.status === 'missed' || call.status === 'cancelled')) {
    void pushToUsers(
      [call.calleeId],
      { kind: 'call-ended', callId, callerName: call.caller.name, missed: true },
      { ttlSeconds: 24 * 3600, urgency: 'normal', topic: `call-${callId}` },
    );
  }
}

export function registerCallRealtime() {
  // Bus "call" events -> the addressed user's sockets on this process
  onEvent((event, send) => {
    if (event.type === 'call') send(event.to, event.payload);
    else if (event.type === 'call.resumed') {
      const key = droppedKey(event.callId, event.userId);
      clearTimeout(dropped.get(key));
      dropped.delete(key);
    }
  });

  onClientMessage('call.', async (client, msg) => {
    const callId = Number(msg.callId);
    switch (msg.type) {
      case 'call.invite': {
        const to = String(msg.to ?? '');
        const callee = await prisma.user.findFirst({ where: { id: to, isActive: true }, select: { id: true } });
        if (!callee || callee.id === client.userId) return reply(client, { type: 'call.error', code: 'INVALID_CALLEE' });
        if (await isBusy(client.userId)) return reply(client, { type: 'call.error', code: 'ALREADY_IN_CALL' });
        if (await isBusy(to)) {
          const failed = await createCall(client.userId, to, 'failed', 'busy');
          await finalise(failed, client.ctx);
          return reply(client, { type: 'call.busy', call: toCallDto(failed, client.userId) });
        }
        const call = await createCall(client.userId, to);
        track(client, call.id);
        reply(client, { type: 'call.ringing', call: toCallDto(call, client.userId) });
        await toUser(to, { type: 'call.incoming', call: toCallDto(call, to) });
        // Devices where BIRDS is closed ring through a notification; opening it replays the call
        void pushToUsers([to], { kind: 'call', callId: call.id, callerName: client.name }, { ttlSeconds: env.CALL_RING_SECONDS, urgency: 'high', topic: `call-${call.id}` });
        setTimeout(async () => {
          const missed = await transition(call.id, ['ringing'], 'missed', 'no answer').catch(() => null);
          if (missed) await ended(call.id, client.ctx);
        }, RING_MS).unref();
        return;
      }
      case 'call.accept': {
        const call = await getCall(callId);
        if (!call || call.calleeId !== client.userId) return;
        const updated = await transition(callId, ['ringing'], 'answered');
        if (!updated) return reply(client, { type: 'call.ended', callId, status: call.status });
        track(client, callId);
        await toUser(call.callerId, { type: 'call.accepted', callId });
        // The callee's other tabs stop ringing
        await toUser(call.calleeId, { type: 'call.taken', callId });
        return;
      }
      case 'call.decline':
      case 'call.cancel':
      case 'call.end': {
        const call = await getCall(callId);
        if (!call || (call.callerId !== client.userId && call.calleeId !== client.userId)) return;
        const isCaller = call.callerId === client.userId;
        let done = null;
        if (msg.type === 'call.decline' && !isCaller) done = await transition(callId, ['ringing'], 'declined');
        else if (msg.type === 'call.cancel' && isCaller) done = await transition(callId, ['ringing'], 'cancelled');
        else if (msg.type === 'call.end') {
          done =
            (await transition(callId, ['answered'], 'ended', isCaller ? 'caller hung up' : 'callee hung up')) ??
            (isCaller ? await transition(callId, ['ringing'], 'cancelled') : null);
        }
        untrack(client, callId);
        if (done) await ended(callId, client.ctx);
        return;
      }
      case 'call.resume': {
        // A participant's socket reconnected during a call: attach the call to the new socket
        const call = await getCall(callId);
        if (!call || (call.callerId !== client.userId && call.calleeId !== client.userId)) return;
        if (!['ringing', 'answered'].includes(call.status)) {
          return reply(client, { type: 'call.ended', callId, status: call.status, reason: call.endReason });
        }
        if (call.status === 'answered' || call.callerId === client.userId) track(client, callId);
        await publish({ type: 'call.resumed', callId, userId: client.userId });
        return reply(client, { type: 'call.resumed', callId, status: call.status });
      }
      case 'call.signal': {
        // WebRTC offer/answer/ICE candidate, relayed as-is to the other participant of a live call
        const call = await getCall(callId);
        if (!call || !['ringing', 'answered'].includes(call.status)) return;
        if (call.callerId !== client.userId && call.calleeId !== client.userId) return;
        const other = call.callerId === client.userId ? call.calleeId : call.callerId;
        if (typeof msg.data !== 'object' || msg.data === null || JSON.stringify(msg.data).length > 32_000) return;
        await toUser(other, { type: 'call.signal', callId, data: msg.data });
        return;
      }
    }
  });

  // A socket that connects while a call to this user is still ringing (the app was opened from
  // the call notification, or reconnected) gets the call
  onClientReady(async (client) => {
    const ringing = await prisma.call.findMany({ where: { calleeId: client.userId, status: 'ringing' }, select: { id: true } });
    for (const { id } of ringing) {
      const call = await getCall(id);
      if (call?.status === 'ringing') reply(client, { type: 'call.incoming', call: toCallDto(call, client.userId) });
    }
  });

  // A socket that goes away ends its calls unless the user reconnects in time
  onClientClose((client) => {
    const ids = tracked.get(client);
    if (!ids?.size) return;
    for (const id of ids) {
      const key = droppedKey(id, client.userId);
      clearTimeout(dropped.get(key));
      logger.info('Call participant disconnected; waiting for reconnect', { callId: id, userId: client.userId });
      const timer = setTimeout(() => {
        dropped.delete(key);
        void (async () => {
          const call = await getCall(id);
          if (!call) return;
          const isCaller = call.callerId === client.userId;
          const done =
            (await transition(id, ['answered'], 'ended', 'connection lost')) ??
            (isCaller ? await transition(id, ['ringing'], 'cancelled', 'connection lost') : null);
          if (done) await ended(id, client.ctx);
        })().catch((err) => logger.warn('Ending call after disconnect failed', { err: String(err) }));
      }, RECONNECT_MS);
      timer.unref();
      dropped.set(key, timer);
    }
  });
}
