import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';

// Web push: device registration, who gets pushed (live sessions only), payloads without message
// text, cleanup of dead devices, call / missed-call pushes, and the ringing call replayed to an app
// opened from the notification. The push library's sender is replaced: nothing leaves the machine.
const sent: { endpoint: string; payload: Record<string, unknown>; options: Record<string, unknown> }[] = [];
const failFor = new Map<string, number>(); // endpoint -> HTTP status the "push service" answers
vi.mock('web-push', async (importOriginal) => {
  const real = (await importOriginal<{ default: Record<string, unknown> }>()).default;
  return {
    default: {
      ...real,
      sendNotification: vi.fn(async (sub: { endpoint: string }, body: string, options: Record<string, unknown>) => {
        const status = failFor.get(sub.endpoint);
        if (status) throw Object.assign(new Error(`push service said ${status}`), { statusCode: status });
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body), options });
        return { statusCode: 201 };
      }),
    },
  };
});

const { registerCallRealtime } = await import('../src/modules/calls/calls.realtime.js');
const { startBus, stopBus } = await import('../src/realtime/bus.js');
const { attachRealtime, stopRealtime } = await import('../src/realtime/hub.js');
const { app, as, lastAudit, prisma } = await import('./helpers.js');

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client, sector: Client, verifier: Client;
let server: Server;
let wsUrl: string;
const P = '/api/v1/push';
const M = '/api/v1/messaging';
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const endpoint = (name: string) => `https://push.example.test/${name}-${Date.now()}`;
const until = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
};

beforeAll(async () => {
  registerCallRealtime();
  server = createServer(app);
  attachRealtime(server);
  await startBus();
  await new Promise<void>((r) => server.listen(0, r));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ws`;
  [operator, sector, verifier] = await Promise.all([as('operator'), as('sector'), as('verifier')]);
});
afterAll(async () => {
  stopRealtime();
  await stopBus();
  await new Promise((r) => server.close(r));
  // Fake endpoints must not linger for later test files
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { startsWith: 'https://push.example.test/' } } });
  await prisma.$disconnect();
});
beforeEach(() => {
  sent.length = 0;
});

describe('device registration', () => {
  it('reports the public key, registers a device and audits it', async () => {
    const cfg = await operator.get(`${P}/config`);
    expect(cfg.body).toMatchObject({ enabled: true });
    expect(cfg.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);

    expect((await operator.post(`${P}/subscriptions`, { endpoint: 'http://insecure.example/x', keys })).status).toBe(400);
    expect((await operator.post(`${P}/subscriptions`, { endpoint: endpoint('bad'), keys: { p256dh: '<script>', auth: 'x' } })).status).toBe(400);

    const ep = endpoint('reg');
    expect((await operator.post(`${P}/subscriptions`, { endpoint: ep, keys })).body).toEqual({ active: true });
    expect((await lastAudit('PUSH_SUBSCRIBE'))?.userId).toBe(operator.user.id);
    expect((await operator.get(`${P}/status?endpoint=${encodeURIComponent(ep)}`)).body).toEqual({ active: true });

    // Another user can't silently take over the device on resume, but can turn it on explicitly
    expect((await sector.post(`${P}/subscriptions`, { endpoint: ep, keys, resume: true })).body).toEqual({ active: false });
    expect((await prisma.pushSubscription.findUnique({ where: { endpoint: ep } }))?.userId).toBe(operator.user.id);

    expect((await operator.delete(`${P}/subscriptions`, { endpoint: ep })).body).toEqual({ active: false });
    expect((await lastAudit('PUSH_UNSUBSCRIBE'))?.userId).toBe(operator.user.id);
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: ep } })).toBeNull();
  });
});

describe('message pushes', () => {
  it('pushes to the other members without the message text, and stops when signed out', async () => {
    const op = endpoint('op');
    const vf = endpoint('vf');
    await operator.post(`${P}/subscriptions`, { endpoint: op, keys });
    const v = await as('verifier'); // a session of its own, signed out below
    await v.post(`${P}/subscriptions`, { endpoint: vf, keys });

    const g = await sector.post(`${M}/conversations`, { kind: 'group', title: 'Push check', memberIds: [operator.user.id, verifier.user.id] });
    await sector.post(`${M}/conversations/${g.body.id}/messages`, { body: 'Secret patrol route via pillar 2084' });
    await until(() => sent.length >= 2);
    const toOp = sent.find((s) => s.endpoint === op)!;
    expect(toOp.payload).toEqual({ kind: 'message', conversationId: g.body.id, senderName: sector.user.name, groupTitle: 'Push check', voice: false });
    expect(JSON.stringify(sent)).not.toContain('Secret patrol');
    expect(toOp.options).toMatchObject({ topic: `conv-${g.body.id}`, urgency: 'normal' });
    // Never to the sender
    expect(sent.every((s) => s.endpoint === op || s.endpoint === vf)).toBe(true);

    // Signing out ends pushes to that device
    await v.post('/api/v1/auth/logout');
    sent.length = 0;
    await sector.post(`${M}/conversations/${g.body.id}/messages`, { body: 'second' });
    await until(() => sent.length >= 1);
    await new Promise((r) => setTimeout(r, 200));
    expect(sent.map((s) => s.endpoint)).toEqual([op]);
    verifier = await as('verifier');
  });

  it('forgets devices the push service reports gone', async () => {
    const gone = endpoint('gone');
    await operator.post(`${P}/subscriptions`, { endpoint: gone, keys });
    failFor.set(gone, 410);
    const d = await sector.post(`${M}/conversations`, { kind: 'direct', userId: operator.user.id });
    await sector.post(`${M}/conversations/${d.body.id}/messages`, { body: 'are you there' });
    await until(() => false, 500).catch(() => {});
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: gone } })).toBeNull();
  });
});

describe('call pushes', () => {
  async function socket(token: string) {
    const ws = new WebSocket(wsUrl);
    const inbox: Record<string, unknown>[] = [];
    ws.on('message', (d) => inbox.push(JSON.parse(String(d))));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token }));
    await until(() => inbox.some((m) => m.type === 'ready'));
    return { ws, inbox, send: (m: Record<string, unknown>) => ws.send(JSON.stringify(m)) };
  }

  it('rings a closed app by push, replays the call when it opens, and reports a missed call', async () => {
    const vf = endpoint('vf-call');
    await verifier.post(`${P}/subscriptions`, { endpoint: vf, keys });
    const caller = await socket(operator.token);

    caller.send({ type: 'call.invite', to: verifier.user.id });
    await until(() => sent.some((s) => s.endpoint === vf && s.payload.kind === 'call'));
    const ring = sent.find((s) => s.payload.kind === 'call')!;
    const callId = ring.payload.callId as number;
    expect(ring.payload).toMatchObject({ kind: 'call', callId, callerName: operator.user.name, ringSeconds: 1 });
    expect(ring.payload.declineToken).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    expect(ring.options).toMatchObject({ urgency: 'high', TTL: 1, topic: `call-${callId}` });

    // The verifier opens BIRDS from the notification: the ringing call arrives on connect
    const callee = await socket(verifier.token);
    await until(() => callee.inbox.some((m) => m.type === 'call.incoming'));
    expect(callee.inbox.find((m) => m.type === 'call.incoming')).toMatchObject({ call: { id: callId, status: 'ringing' } });
    callee.ws.close();

    // Not answered within CALL_RING_SECONDS (1 in tests): a missed-call push replaces the ringing one
    await until(() => sent.some((s) => s.payload.kind === 'call-ended'), 5000);
    expect(sent.find((s) => s.payload.kind === 'call-ended')!.payload).toEqual({ kind: 'call-ended', callId, callerName: operator.user.name, missed: true });
    caller.ws.close();
  });

  it('declines from the notification with the token of that call only', async () => {
    const vf = endpoint('vf-decline');
    await verifier.post(`${P}/subscriptions`, { endpoint: vf, keys });
    const caller = await socket(operator.token);
    const ring = async () => {
      sent.length = 0;
      caller.send({ type: 'call.invite', to: verifier.user.id });
      await until(() => sent.some((s) => s.endpoint === vf && s.payload.kind === 'call'));
      return sent.find((s) => s.payload.kind === 'call')!.payload as { callId: number; declineToken: string };
    };
    const decline = (id: number, token: string) => request(app).post(`/api/v1/calls/${id}/decline`).send({ token });

    const first = await ring();
    // Tampered, or used for another call: refused
    const [exp, sig] = first.declineToken.split('.');
    expect((await decline(first.callId, `${exp}.${sig!.slice(0, -2)}AA`)).status).toBe(403);
    expect((await decline(first.callId, `${Number(exp) + 1000}.${sig}`)).status).toBe(403);
    expect((await decline(first.callId + 1000, first.declineToken)).status).toBe(403);
    // The real one declines the call, and the caller is told
    expect((await decline(first.callId, first.declineToken)).status).toBe(204);
    await until(() => caller.inbox.some((m) => m.type === 'call.ended' && m.callId === first.callId));
    expect(caller.inbox.find((m) => m.type === 'call.ended' && m.callId === first.callId)).toMatchObject({ status: 'declined' });
    // Only once
    expect((await decline(first.callId, first.declineToken)).status).toBe(204);
    expect((await prisma.call.findUnique({ where: { id: first.callId } }))?.status).toBe('declined');
    caller.ws.close();
  });
});
