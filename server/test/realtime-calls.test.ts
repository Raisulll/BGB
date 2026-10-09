import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { registerCallRealtime } from '../src/modules/calls/calls.realtime.js';
import { registerMessagingRealtime } from '../src/modules/messaging/messaging.realtime.js';
import { startBus, stopBus } from '../src/realtime/bus.js';
import { attachRealtime, stopRealtime } from '../src/realtime/hub.js';
import { app, as, lastAudit, prisma } from './helpers.js';

// Realtime channel (auth, origin check, message push) and 1:1 call signalling + call log

type Client = Awaited<ReturnType<typeof as>>;
let server: Server;
let url: string;
let operator: Client, sector: Client, verifier: Client;
const open: WebSocket[] = [];

beforeAll(async () => {
  registerMessagingRealtime();
  registerCallRealtime();
  server = createServer(app);
  attachRealtime(server);
  await startBus();
  await new Promise<void>((r) => server.listen(0, r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ws`;
  [operator, sector, verifier] = await Promise.all([as('operator'), as('sector'), as('verifier')]);
});

afterAll(async () => {
  for (const ws of open) ws.terminate();
  stopRealtime();
  await stopBus();
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

/** A connected, authenticated socket that queues what it receives. */
async function connect(token: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(url, { headers });
  open.push(ws);
  const inbox: Record<string, unknown>[] = [];
  const waiters: { pred: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }[] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m);
    else inbox.push(m);
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'auth', token }));
  const next = (pred: (m: Record<string, unknown>) => boolean, ms = 4000) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const i = inbox.findIndex(pred);
      if (i >= 0) return resolve(inbox.splice(i, 1)[0]!);
      const timer = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
      waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  await next((m) => m.type === 'ready');
  const send = (m: Record<string, unknown>) => ws.send(JSON.stringify(m));
  return { ws, next, send, type: (t: string, ms?: number) => next((m) => m.type === t, ms) };
}

describe('realtime channel', () => {
  it('rejects a bad token and a foreign origin', async () => {
    const ws = new WebSocket(url);
    open.push(ws);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: 'not-a-token' }));
    const code = await new Promise<number>((r) => ws.once('close', (c) => r(c)));
    expect(code).toBe(4001);

    const evil = new WebSocket(url, { headers: { Origin: 'https://evil.example' } });
    open.push(evil);
    const err = await new Promise<Error>((r) => evil.once('error', r));
    expect(err.message).toContain('403');
  });

  it('pushes new messages to the other member at once', async () => {
    const rx = await connect(sector.token);
    const c = await operator.post('/api/v1/messaging/conversations', { kind: 'direct', userId: sector.user.id });
    await operator.post(`/api/v1/messaging/conversations/${c.body.id}/messages`, { body: 'Realtime check' });
    const pushed = (await rx.next((m) => m.type === 'message' && (m.message as { body: string }).body === 'Realtime check')) as { message: { conversationId: number } };
    expect(pushed.message.conversationId).toBe(c.body.id);
  });
});

describe('calls', () => {
  it('rings, connects, relays WebRTC signalling, ends and logs the call', async () => {
    const caller = await connect(operator.token);
    const callee = await connect(sector.token);
    caller.send({ type: 'call.invite', to: sector.user.id });
    const ringing = (await caller.type('call.ringing')) as { call: { id: number } };
    const incoming = (await callee.type('call.incoming')) as { call: { id: number; other: { id: string } } };
    expect(incoming.call.id).toBe(ringing.call.id);
    expect(incoming.call.other.id).toBe(operator.user.id);
    const id = ringing.call.id;

    // A third person calling someone who is in a call gets "busy"
    const third = await connect(verifier.token);
    callee.send({ type: 'call.accept', callId: id });
    await caller.type('call.accepted');
    third.send({ type: 'call.invite', to: sector.user.id });
    expect((await third.type('call.busy')) as { call: { status: string } }).toMatchObject({ call: { status: 'failed' } });

    caller.send({ type: 'call.signal', callId: id, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
    expect((await callee.type('call.signal')) as { data: unknown }).toMatchObject({ data: { sdp: { type: 'offer' } } });
    callee.send({ type: 'call.signal', callId: id, data: { candidate: { candidate: 'candidate:1' } } });
    await caller.type('call.signal');

    await new Promise((r) => setTimeout(r, 1100)); // a measurable duration
    caller.send({ type: 'call.end', callId: id });
    expect(await callee.type('call.ended')).toMatchObject({ callId: id, status: 'ended' });
    await caller.type('call.ended');

    const log = await sector.get('/api/v1/calls');
    const entry = log.body.data.find((c: { id: number }) => c.id === id);
    expect(entry).toMatchObject({ status: 'ended', direction: 'incoming', other: { id: operator.user.id } });
    expect(entry.durationSeconds).toBeGreaterThanOrEqual(1);
    expect((await lastAudit('CALL'))?.details).toContain(`Call #${id}`);
  });

  it('records declined and missed calls, and tells the callee about a missed call', async () => {
    const caller = await connect(operator.token);
    const callee = await connect(verifier.token);

    caller.send({ type: 'call.invite', to: verifier.user.id });
    const declined = ((await callee.type('call.incoming')) as { call: { id: number } }).call.id;
    callee.send({ type: 'call.decline', callId: declined });
    expect(await caller.type('call.ended')).toMatchObject({ callId: declined, status: 'declined' });

    caller.send({ type: 'call.invite', to: verifier.user.id });
    const missed = ((await callee.type('call.incoming')) as { call: { id: number } }).call.id;
    expect(await caller.type('call.ended', 5000)).toMatchObject({ callId: missed, status: 'missed' }); // CALL_RING_SECONDS=1 in tests
    const note = await prisma.notification.findFirst({ where: { userId: verifier.user.id, type: 'call' }, orderBy: { id: 'desc' } });
    expect(note?.message).toContain(operator.user.name);
  });

  it('ends a call when a participant disconnects', async () => {
    const caller = await connect(operator.token);
    const callee = await connect(sector.token);
    caller.send({ type: 'call.invite', to: sector.user.id });
    const id = ((await callee.type('call.incoming')) as { call: { id: number } }).call.id;
    callee.send({ type: 'call.accept', callId: id });
    await caller.type('call.accepted');
    callee.ws.close();
    expect(await caller.type('call.ended')).toMatchObject({ callId: id, status: 'ended', reason: 'connection lost' });
  });

  it('gives browsers the ICE servers, and the full log to auditors only', async () => {
    const ice = await operator.get('/api/v1/calls/ice');
    expect(ice.body.iceServers[0].urls.length).toBeGreaterThan(0);
    expect((await operator.get('/api/v1/calls/all')).status).toBe(403);
    const auditor = await as('auditor');
    const all = await auditor.get('/api/v1/calls/all');
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(4);
  });
});
