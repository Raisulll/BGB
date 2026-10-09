import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app, as, DEMO, lastAudit, prisma } from './helpers.js';

const login = (username: string, password: string) => request(app).post('/api/v1/auth/login').send({ username, password });
const refreshCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('birds_rt='))?.split(';')[0];

afterAll(() => prisma.$disconnect());

describe('auth: login and session', () => {
  it('logs in, returns user + permissions, and sets an httpOnly strict refresh cookie', async () => {
    const res = await login(DEMO.admin.username, DEMO.admin.password);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ username: 'hq_admin', role: 'HQ Administrator' });
    expect(res.body.user.permissions).toContain('admin');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('birds_rt='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('rejects missing, tampered and garbage tokens', async () => {
    const admin = await as('admin');
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    const tampered = admin.token.slice(0, -4) + 'AAAA';
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('uses one generic message for unknown users and wrong passwords', async () => {
    const unknown = await login('nobody', 'x');
    const wrong = await login('auditor', 'wrong-password');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    await prisma.user.update({ where: { username: 'auditor' }, data: { failedAttempts: 0 } });
  });

  it('rotates the refresh token, and a later replay of the old one kills the session', async () => {
    const first = await login(DEMO.verifier.username, DEMO.verifier.password);
    const c1 = refreshCookie(first)!;
    const r2 = await request(app).post('/api/v1/auth/refresh').set('Cookie', c1);
    expect(r2.status).toBe(200);
    const c2 = refreshCookie(r2)!;
    expect(c2).not.toBe(c1);

    // Replay inside the grace window: rejected, session survives
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', c1)).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${r2.body.accessToken}`)).status).toBe(200);

    // Pretend the rotation happened a minute ago, then replay: treated as theft
    await prisma.refreshToken.updateMany({ where: { previousTokenHash: { not: null }, user: { username: 'verifier' } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', c1)).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${r2.body.accessToken}`)).status).toBe(401);
    expect((await lastAudit('TOKEN_REUSE'))?.username).toBe('verifier');
  });

  it('ends the previous session on a new login (single session) and on logout', async () => {
    const a1 = await as('auditor');
    const a2 = await as('auditor');
    const old = await a1.get('/api/v1/auth/me');
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('SESSION_ENDED');
    expect((await a2.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await a2.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('ends idle sessions server-side', async () => {
    const op = await as('operator');
    await prisma.refreshToken.updateMany({
      where: { user: { username: 'batt_op' }, revoked: false },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    const res = await op.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect((await lastAudit('SESSION_TIMEOUT'))?.username).toBe('batt_op');
  });
});

describe('auth: lockout and password management', () => {
  it('locks after 5 failures (423), even for the right password', async () => {
    for (let i = 0; i < 4; i++) expect((await login('sector_off', 'wrong')).status).toBe(401);
    const fifth = await login('sector_off', 'wrong');
    expect(fifth.status).toBe(423);
    expect((await login(DEMO.sector.username, DEMO.sector.password)).status).toBe(423);
    expect((await lastAudit('ACCOUNT_LOCKED'))?.username).toBe('sector_off');
  });

  it('admin reset unlocks, forces a password change, and blocks other routes until then', async () => {
    const admin = await as('admin');
    const reset = await admin.post('/api/v1/auth/admin/reset-password', { userId: 'U002' });
    expect(reset.status).toBe(200);
    const temp: string = reset.body.temporaryPassword;

    const so = await login('sector_off', temp);
    expect(so.status).toBe(200);
    expect(so.body.user.mustChangePassword).toBe(true);
    const token = so.body.accessToken;

    const blocked = await request(app).get('/api/v1/incidents').set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const weak = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: temp, newPassword: 'weak' });
    expect(weak.status).toBe(400);

    const ok = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: temp, newPassword: DEMO.sector.password });
    expect(ok.status).toBe(204);
    expect((await request(app).get('/api/v1/incidents').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  it('only admins can reset passwords', async () => {
    const op = await as('operator');
    const res = await op.post('/api/v1/auth/admin/reset-password', { userId: 'U002' });
    expect(res.status).toBe(403);
    expect((await lastAudit('PERMISSION_DENIED'))?.username).toBe('batt_op');
  });
});

describe('platform', () => {
  it('health, 404 envelope, bad JSON, validation errors, security headers', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-powered-by']).toBeUndefined();

    expect((await request(app).get('/api/v1/nope')).body.error.code).toBe('NOT_FOUND');
    const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(bad.body.error.code).toBe('BAD_JSON');
    expect((await request(app).post('/api/v1/auth/login').send({})).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the audit hash chain intact', async () => {
    const [row] = await prisma.$queryRaw<{ rows_checked: bigint; first_broken_seq: bigint | null }[]>`SELECT * FROM audit_log_verify()`;
    expect(row!.first_broken_seq).toBeNull();
    expect(Number(row!.rows_checked)).toBeGreaterThan(15);
  });
});
