import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawStorage } from '../src/config/storage.js';
import { app, as, lastAudit, prisma } from './helpers.js';

// Messaging: direct and group conversations, permanent messages, voice notes (spec #58 extension)

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client, sector: Client, verifier: Client, auditor: Client;
const M = '/api/v1/messaging';

beforeAll(async () => {
  [operator, sector, verifier, auditor] = await Promise.all([as('operator'), as('sector'), as('verifier'), as('auditor')]);
});
afterAll(() => prisma.$disconnect());

// A minimal WebM/EBML header followed by filler: recognised as audio/webm by its magic bytes
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]), Buffer.alloc(2048, 7)]);

const binary = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('directory', () => {
  it('lists every other active user, searchable', async () => {
    const all = await operator.get(`${M}/users`);
    expect(all.status).toBe(200);
    expect(all.body.map((u: { id: string }) => u.id)).not.toContain(operator.user.id);
    expect(all.body.length).toBeGreaterThanOrEqual(4);
    const q = await operator.get(`${M}/users?q=karim`);
    expect(q.body.every((u: { name: string }) => /karim/i.test(u.name))).toBe(true);
  });
});

describe('direct conversations', () => {
  it('has one thread per pair, delivers text, tracks unread and read', async () => {
    const a = await operator.post(`${M}/conversations`, { kind: 'direct', userId: sector.user.id });
    expect(a.status).toBe(201);
    const again = await sector.post(`${M}/conversations`, { kind: 'direct', userId: operator.user.id });
    expect(again.body.id).toBe(a.body.id); // same thread from either side
    expect(a.body.title).toBe(sector.user.name);
    // Other test files may have used this pair's thread already: start from "all read"
    await sector.post(`${M}/conversations/${a.body.id}/read`, { lastReadId: 2_000_000_000 });

    const sent = await operator.post(`${M}/conversations/${a.body.id}/messages`, { body: 'Patrol back at 0600.' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ kind: 'text', body: 'Patrol back at 0600.', sender: { id: operator.user.id } });

    const unread = await sector.get(`${M}/unread`);
    expect(unread.body.unread).toBeGreaterThanOrEqual(1);
    const list = await sector.get(`${M}/conversations`);
    expect(list.body.find((c: { id: number }) => c.id === a.body.id)).toMatchObject({ unread: 1, lastMessage: { body: 'Patrol back at 0600.' } });

    const hist = await sector.get(`${M}/conversations/${a.body.id}/messages`);
    expect(hist.body.messages.at(-1).body).toBe('Patrol back at 0600.');
    const read = await sector.post(`${M}/conversations/${a.body.id}/read`, { lastReadId: sent.body.id });
    expect(read.body.unread).toBe(0);
  });

  it('keeps others out, refuses self and empty messages', async () => {
    const c = await operator.post(`${M}/conversations`, { kind: 'direct', userId: sector.user.id });
    expect((await verifier.get(`${M}/conversations/${c.body.id}/messages`)).status).toBe(404);
    expect((await verifier.post(`${M}/conversations/${c.body.id}/messages`, { body: 'hello' })).status).toBe(404);
    expect((await operator.post(`${M}/conversations`, { kind: 'direct', userId: operator.user.id })).status).toBe(400);
    expect((await operator.post(`${M}/conversations/${c.body.id}/messages`, { body: '   ' })).status).toBe(400);
  });

  it('keeps messages permanent in the database', async () => {
    const c = await operator.post(`${M}/conversations`, { kind: 'direct', userId: verifier.user.id });
    const m = await operator.post(`${M}/conversations/${c.body.id}/messages`, { body: 'Original' });
    await expect(prisma.message.update({ where: { id: m.body.id }, data: { body: 'Edited' } })).rejects.toThrow(/append-only/);
    await expect(prisma.message.delete({ where: { id: m.body.id } })).rejects.toThrow(/append-only/);
  });
});

describe('groups', () => {
  it('creates, adds and leaves with system messages and audit entries', async () => {
    const g = await sector.post(`${M}/conversations`, { kind: 'group', title: 'Sector-7 duty officers', memberIds: [operator.user.id, verifier.user.id] });
    expect(g.status).toBe(201);
    expect(g.body.members).toHaveLength(3);
    expect((await lastAudit('MESSAGE_GROUP_CREATE'))?.details).toContain('Sector-7 duty officers');

    const added = await operator.post(`${M}/conversations/${g.body.id}/members`, { userIds: [auditor.user.id] });
    expect(added.body.members).toHaveLength(4);
    expect((await lastAudit('MESSAGE_GROUP_ADD'))?.details).toContain(auditor.user.id);

    expect((await verifier.post(`${M}/conversations/${g.body.id}/leave`)).status).toBe(204);
    expect((await verifier.get(`${M}/conversations/${g.body.id}`)).status).toBe(404);
    const hist = await sector.get(`${M}/conversations/${g.body.id}/messages`);
    const system = hist.body.messages.filter((m: { kind: string }) => m.kind === 'system').map((m: { body: string }) => m.body);
    expect(system[0]).toContain('created the group');
    expect(system.some((s: string) => s.includes('added'))).toBe(true);
    expect(system.at(-1)).toContain('left the group');
  });

  it('cannot add to or leave a direct conversation', async () => {
    const c = await operator.post(`${M}/conversations`, { kind: 'direct', userId: sector.user.id });
    expect((await operator.post(`${M}/conversations/${c.body.id}/members`, { userIds: [verifier.user.id] })).status).toBe(403);
    expect((await operator.post(`${M}/conversations/${c.body.id}/leave`)).status).toBe(403);
  });
});

describe('voice messages', () => {
  it('stores audio encrypted and plays it back to members only', async () => {
    const c = await operator.post(`${M}/conversations`, { kind: 'direct', userId: sector.user.id });
    const audio = webm();
    const res = await request(app)
      .post(`${M}/conversations/${c.body.id}/voice`)
      .set('Authorization', `Bearer ${operator.token}`)
      .field('durationMs', '4200')
      .attach('audio', audio, { filename: 'note.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'voice', voice: { mime: 'audio/webm', durationMs: 4200, size: audio.length } });

    const row = await prisma.message.findUniqueOrThrow({ where: { id: res.body.id } });
    const stored = await rawStorage.read(row.voicePath!);
    expect(stored!.subarray(0, 8).toString()).toBe('BIRDSEV1'); // encrypted at rest

    const back = await binary(sector.get(res.body.voice.url));
    expect(back.status).toBe(200);
    expect(back.headers['content-type']).toBe('audio/webm');
    expect(Buffer.compare(back.body as Buffer, audio)).toBe(0);
    expect((await verifier.get(res.body.voice.url)).status).toBe(404);
  });

  it('refuses files that are not audio', async () => {
    const c = await operator.post(`${M}/conversations`, { kind: 'direct', userId: sector.user.id });
    const res = await request(app)
      .post(`${M}/conversations/${c.body.id}/voice`)
      .set('Authorization', `Bearer ${operator.token}`)
      .field('durationMs', '1000')
      .attach('audio', Buffer.from('<html>not audio</html>'), { filename: 'x.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(415);
    expect((await lastAudit('UPLOAD_REJECTED'))?.details).toContain('Voice message');
  });
});
