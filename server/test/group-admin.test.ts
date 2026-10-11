import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawStorage } from '../src/config/storage.js';
import { app, as, lastAudit, prisma } from './helpers.js';

// Group admin controls: admins, join requests, removal, roles, rename, group photo

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client, sector: Client, verifier: Client, auditor: Client;
const M = '/api/v1/messaging';

beforeAll(async () => {
  [operator, sector, verifier, auditor] = await Promise.all([as('operator'), as('sector'), as('verifier'), as('auditor')]);
});
afterAll(() => prisma.$disconnect());

// 1×1 PNG
const png = () =>
  Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a7e1b6a50000000049454e44ae426082', 'hex');

const newGroup = async (title: string) => {
  const g = await sector.post(`${M}/conversations`, { kind: 'group', title, memberIds: [operator.user.id, verifier.user.id] });
  expect(g.status).toBe(201);
  return g.body.id as number;
};
const systemMessages = async (id: number) =>
  (await sector.get(`${M}/conversations/${id}/messages`)).body.messages.filter((m: { kind: string }) => m.kind === 'system').map((m: { body: string }) => m.body) as string[];

describe('group admins', () => {
  it('makes the creator admin and everyone else a member', async () => {
    const id = await newGroup('Roles check');
    const c = (await sector.get(`${M}/conversations/${id}`)).body;
    expect(c.myRole).toBe('admin');
    const roles = Object.fromEntries(c.members.map((m: { id: string; groupRole: string }) => [m.id, m.groupRole]));
    expect(roles).toEqual({ [sector.user.id]: 'admin', [operator.user.id]: 'member', [verifier.user.id]: 'member' });
    expect((await operator.get(`${M}/conversations/${id}`)).body.myRole).toBe('member');
  });

  it("turns a member's additions into requests that an admin approves or rejects", async () => {
    const id = await newGroup('Requests check');
    const r = await operator.post(`${M}/conversations/${id}/members`, { userIds: [auditor.user.id] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ added: [], requested: [auditor.user.id] });
    expect(r.body.conversation.members).toHaveLength(3);
    expect((await lastAudit('MESSAGE_GROUP_REQUEST'))?.details).toContain(auditor.user.id);
    // Asking again doesn't duplicate; the requester sees their own request
    expect((await operator.post(`${M}/conversations/${id}/members`, { userIds: [auditor.user.id] })).body.requested).toEqual([]);
    expect((await operator.get(`${M}/conversations/${id}`)).body.pendingRequests).toHaveLength(1);
    // Not a member yet
    expect((await auditor.get(`${M}/conversations/${id}`)).status).toBe(404);

    // The admin is notified and sees the request
    const note = await prisma.notification.findFirst({ where: { userId: sector.user.id, type: 'group', conversationId: id }, orderBy: { id: 'desc' } });
    expect(note?.message).toContain(operator.user.name);
    const pending = (await sector.get(`${M}/conversations/${id}`)).body.pendingRequests;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ user: { id: auditor.user.id }, requestedBy: { id: operator.user.id } });

    // Members can't decide
    expect((await verifier.post(`${M}/conversations/${id}/requests/${pending[0].id}/approve`)).status).toBe(403);

    const ok = await sector.post(`${M}/conversations/${id}/requests/${pending[0].id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.members.map((m: { id: string }) => m.id)).toContain(auditor.user.id);
    expect(ok.body.pendingRequests).toHaveLength(0);
    expect((await auditor.get(`${M}/conversations/${id}`)).status).toBe(200);
    expect((await systemMessages(id)).at(-1)).toContain(`asked by ${operator.user.name}`);
    expect((await sector.post(`${M}/conversations/${id}/requests/${pending[0].id}/approve`)).status).toBe(409);
    const told = await prisma.notification.findFirst({ where: { userId: operator.user.id, type: 'group', conversationId: id }, orderBy: { id: 'desc' } });
    expect(told?.title).toBe('Join request approved');

    // Rejected request: nobody added
    await sector.delete(`${M}/conversations/${id}/members/${auditor.user.id}`);
    const again = await verifier.post(`${M}/conversations/${id}/members`, { userIds: [auditor.user.id] });
    const rid = (await sector.get(`${M}/conversations/${id}`)).body.pendingRequests[0].id;
    expect(again.body.requested).toEqual([auditor.user.id]);
    expect((await sector.post(`${M}/conversations/${id}/requests/${rid}/reject`)).status).toBe(200);
    expect((await auditor.get(`${M}/conversations/${id}`)).status).toBe(404);
    expect((await lastAudit('MESSAGE_GROUP_REJECT'))?.details).toContain(`request #${rid}`);
    // A decided request is part of the record
    await expect(prisma.conversationJoinRequest.update({ where: { id: rid }, data: { status: 'pending', decidedAt: null, decidedBy: null } })).rejects.toThrow();
    await expect(prisma.conversationJoinRequest.delete({ where: { id: rid } })).rejects.toThrow();
  });

  it('lets an admin remove members, who then lose access', async () => {
    const id = await newGroup('Removal check');
    expect((await operator.delete(`${M}/conversations/${id}/members/${verifier.user.id}`)).status).toBe(403);
    const r = await sector.delete(`${M}/conversations/${id}/members/${verifier.user.id}`);
    expect(r.status).toBe(200);
    expect(r.body.members.map((m: { id: string }) => m.id)).not.toContain(verifier.user.id);
    expect((await verifier.get(`${M}/conversations/${id}`)).status).toBe(404);
    expect((await verifier.post(`${M}/conversations/${id}/messages`, { body: 'still here?' })).status).toBe(404);
    expect((await systemMessages(id)).at(-1)).toBe(`${sector.user.name} removed ${verifier.user.name}`);
    expect((await lastAudit('MESSAGE_GROUP_REMOVE'))?.details).toContain(verifier.user.id);
    const row = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: id, userId: verifier.user.id } } });
    expect(row?.removedBy).toBe(sector.user.id);
    // Removing yourself is "leave"
    expect((await sector.delete(`${M}/conversations/${id}/members/${sector.user.id}`)).status).toBe(400);
  });

  it('manages admins and always keeps one', async () => {
    const id = await newGroup('Admins check');
    expect((await operator.patch(`${M}/conversations/${id}/members/${verifier.user.id}`, { role: 'admin' })).status).toBe(403);
    // The only admin can't step down
    expect((await sector.patch(`${M}/conversations/${id}/members/${sector.user.id}`, { role: 'member' })).status).toBe(409);
    const made = await sector.patch(`${M}/conversations/${id}/members/${operator.user.id}`, { role: 'admin' });
    expect(made.body.members.find((m: { id: string }) => m.id === operator.user.id).groupRole).toBe('admin');
    expect((await lastAudit('MESSAGE_GROUP_ROLE'))?.details).toContain(`${operator.user.id} to admin`);
    // The new admin adds people directly
    const add = await operator.post(`${M}/conversations/${id}/members`, { userIds: [auditor.user.id] });
    expect(add.body.added).toEqual([auditor.user.id]);

    // Both admins leave: the longest-standing remaining member takes over
    await sector.post(`${M}/conversations/${id}/leave`);
    await operator.post(`${M}/conversations/${id}/leave`);
    const c = (await verifier.get(`${M}/conversations/${id}`)).body;
    expect(c.myRole).toBe('admin');
    const sys = (await verifier.get(`${M}/conversations/${id}/messages`)).body.messages.filter((m: { kind: string }) => m.kind === 'system');
    expect(sys.at(-1).body).toBe(`${verifier.user.name} is now an admin`);
  });

  it('lets an admin rename the group', async () => {
    const id = await newGroup('Rename check');
    expect((await operator.patch(`${M}/conversations/${id}`, { title: 'Hijacked' })).status).toBe(403);
    expect((await sector.patch(`${M}/conversations/${id}`, { title: 'x' })).status).toBe(400);
    const r = await sector.patch(`${M}/conversations/${id}`, { title: 'Teknaf river line' });
    expect(r.body.title).toBe('Teknaf river line');
    expect((await systemMessages(id)).at(-1)).toContain('renamed the group to "Teknaf river line"');
    expect((await lastAudit('MESSAGE_GROUP_RENAME'))?.details).toContain('"Rename check"');
    const direct = await operator.post(`${M}/conversations`, { kind: 'direct', userId: sector.user.id });
    expect((await operator.patch(`${M}/conversations/${direct.body.id}`, { title: 'Nope' })).status).toBe(403);
  });

  it('stores the group photo encrypted, serves it to members only and checks it', async () => {
    const id = await newGroup('Photo check');
    const upload = (who: Client, buf: Buffer, name = 'photo.png', type = 'image/png') =>
      request(app).post(`${M}/conversations/${id}/cover`).set('Authorization', `Bearer ${who.token}`).attach('image', buf, { filename: name, contentType: type });

    expect((await upload(operator, png())).status).toBe(403);
    // Content decides the type, not the name
    const fake = await upload(sector, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>xxxxxxxx'), 'evil.png');
    expect(fake.status).toBe(415);

    const r = await upload(sector, png());
    expect(r.status).toBe(200);
    expect(r.body.coverUrl).toMatch(new RegExp(`^/api/v1/messaging/conversations/${id}/cover\\?v=\\d+$`));
    expect((await lastAudit('MESSAGE_GROUP_COVER'))?.details).toContain('image/png');

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    const stored = await rawStorage.read(row.coverPath!);
    expect(stored!.subarray(0, 8).toString()).toBe('BIRDSEV1'); // encrypted at rest

    const img = await request(app).get(r.body.coverUrl).set('Authorization', `Bearer ${operator.token}`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await request(app).get(r.body.coverUrl).set('Authorization', `Bearer ${auditor.token}`)).status).toBe(404);

    const removed = await sector.delete(`${M}/conversations/${id}/cover`);
    expect(removed.body.coverUrl).toBeNull();
    expect(await rawStorage.read(row.coverPath!)).toBeNull();
    expect((await systemMessages(id)).at(-1)).toContain('removed the group photo');
  });
});
