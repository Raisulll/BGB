import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, as, lastAudit, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, operator: Client;

beforeAll(async () => {
  admin = await as('admin');
  operator = await as('operator');
});
afterAll(async () => {
  await admin.post('/api/v1/admin/roles/permissions/reset');
  await prisma.$disconnect();
});

const login = (username: string, password: string) => request(app).post('/api/v1/auth/login').send({ username, password });
const newUser = (overrides: Record<string, unknown> = {}) => ({
  username: 'bop_teknaf_op',
  name: 'Nk. Rahim',
  role: 'Battalion Operator',
  scope: 'BOP Teknaf',
  email: 'rahim@bgb.gov.bd',
  ...overrides,
});

describe('user administration (spec #3, §19.2)', () => {
  it('is admin-only', async () => {
    expect((await operator.get('/api/v1/users')).status).toBe(403);
  });

  it('lists and filters users without exposing password hashes', async () => {
    const res = await admin.get('/api/v1/users?role=Auditor');
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { username: string }) => u.username)).toEqual(['auditor']);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('creates a user with a generated temporary password that must be changed', async () => {
    const res = await admin.post('/api/v1/users', newUser());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: 'U006', username: 'bop_teknaf_op', scope: 'BOP Teknaf', mustChangePassword: true });
    const loggedIn = await login('bop_teknaf_op', res.body.temporaryPassword);
    expect(loggedIn.body.user.mustChangePassword).toBe(true);
    expect((await lastAudit('CREATE_USER'))?.details).toContain('U006');
  });

  it('rejects duplicates (409), unknown roles/scopes and weak passwords (400)', async () => {
    expect((await admin.post('/api/v1/users', newUser())).status).toBe(409);
    expect((await admin.post('/api/v1/users', newUser({ username: 'other_user' }))).body.error.code).toBe('DUPLICATE'); // same email
    expect((await admin.post('/api/v1/users', newUser({ username: 'x_user', email: 'x@bgb.gov.bd', role: 'Commander' }))).status).toBe(400);
    expect((await admin.post('/api/v1/users', newUser({ username: 'y_user', email: 'y@bgb.gov.bd', scope: 'Sector-99' }))).status).toBe(400);
    expect((await admin.post('/api/v1/users', newUser({ username: 'z_user', email: 'z@bgb.gov.bd', password: 'short' }))).status).toBe(400);
    expect((await admin.post('/api/v1/users', newUser({ username: 'Bad Name!', email: 'b@bgb.gov.bd' }))).status).toBe(400);
  });

  it('ends a user\'s sessions when their role changes', async () => {
    const created = await admin.post('/api/v1/users', newUser({ username: 'role_change', email: 'rc@bgb.gov.bd', password: 'Strong#Pass1' }));
    const id = created.body.user.id;
    const session = await login('role_change', 'Strong#Pass1');
    const token = session.body.accessToken;

    const res = await admin.patch(`/api/v1/users/${id}`, { role: 'Auditor', scope: 'HQ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'Auditor', scope: 'HQ' });
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await lastAudit('ROLE_CHANGE'))?.details).toContain('role: Battalion Operator → Auditor');
  });

  it('deactivates (soft delete) and reactivates', async () => {
    const created = await admin.post('/api/v1/users', newUser({ username: 'leaver', email: 'leaver@bgb.gov.bd', password: 'Strong#Pass1' }));
    const id = created.body.user.id;
    const del = await admin.delete(`/api/v1/users/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.isActive).toBe(false);
    expect((await login('leaver', 'Strong#Pass1')).status).toBe(401);
    expect(await prisma.user.count({ where: { id } })).toBe(1); // still there for the record
    expect((await admin.patch(`/api/v1/users/${id}`, { isActive: true })).body.isActive).toBe(true);
    expect((await login('leaver', 'Strong#Pass1')).status).toBe(200);
  });

  it('unlocks a locked account', async () => {
    for (let i = 0; i < 5; i++) await login('auditor', 'wrong');
    expect((await login('auditor', 'Audit@123')).status).toBe(423);
    const res = await admin.patch('/api/v1/users/U005', { unlock: true });
    expect(res.body.locked).toBe(false);
    expect((await lastAudit('UNLOCK_USER'))?.details).toContain('account unlocked');
    expect((await login('auditor', 'Audit@123')).status).toBe(200);
  });

  it('protects the administrators: no self-demotion, and the last HQ admin cannot be removed', async () => {
    expect((await admin.patch('/api/v1/users/U001', { role: 'Auditor' })).body.error.code).toBe('SELF_CHANGE');
    expect((await admin.delete('/api/v1/users/U001')).body.error.code).toBe('SELF_CHANGE');

    // Give Sector Officers the admin page, then try to remove the only HQ Administrator
    await admin.patch('/api/v1/admin/roles/permissions', { role: 'Sector Officer', pageId: 'admin', enabled: true });
    const sector = await as('sector');
    const res = await sector.delete('/api/v1/users/U001');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
  });
});
