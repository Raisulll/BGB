import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, as, DEMO, prisma } from './helpers.js';

// Server behaviour added for the React frontend (Session 9): policy in /me, background requests
// that don't count as activity, timeout logout, category breakdowns, audit-view logging.

type Client = Awaited<ReturnType<typeof as>>;
const sidOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).sid as string;
const FIVE_MIN_AGO = () => new Date(Date.now() - 5 * 60_000);

afterAll(() => prisma.$disconnect());

describe('GET /auth/me policy (specs #28, #29)', () => {
  it('gives every role the idle timeout and password rules, but not the lockout thresholds', async () => {
    const op = await as('operator');
    const res = await op.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.policy).toEqual({
      sessionTimeoutMinutes: expect.any(Number),
      password: { minLength: expect.any(Number), requireUppercase: expect.any(Boolean), requireNumber: expect.any(Boolean), requireSpecial: expect.any(Boolean) },
    });
    expect(JSON.stringify(res.body.policy)).not.toMatch(/maxAttempts|lockout/);
  });
});

describe('background requests are not user activity (spec #28)', () => {
  it('X-Background-Request leaves last_seen_at alone; a normal request updates it', async () => {
    const op = await as('operator');
    const sid = sidOf(op.token);
    const old = FIVE_MIN_AGO();
    await prisma.refreshToken.update({ where: { id: sid }, data: { lastSeenAt: old } });

    expect((await op.get('/api/v1/notifications').set('X-Background-Request', '1')).status).toBe(200);
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { id: sid } })).lastSeenAt.getTime()).toBe(old.getTime());

    expect((await op.get('/api/v1/notifications')).status).toBe(200);
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { id: sid } })).lastSeenAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it('a background refresh rotates the token without resetting the idle clock', async () => {
    const login = await request(app).post('/api/v1/auth/login').send(DEMO.verifier);
    const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('birds_rt='))!.split(';')[0]!;
    const sid = sidOf(login.body.accessToken);
    const old = FIVE_MIN_AGO();
    await prisma.refreshToken.update({ where: { id: sid }, data: { lastSeenAt: old } });

    const bg = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Background-Request', '1');
    expect(bg.status).toBe(200);
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { id: sid } })).lastSeenAt.getTime()).toBe(old.getTime());
  });

  it('an idle session still expires when only background traffic arrives', async () => {
    const op = await as('operator');
    const sid = sidOf(op.token);
    await prisma.refreshToken.update({ where: { id: sid }, data: { lastSeenAt: new Date(Date.now() - 24 * 60 * 60_000) } });
    const res = await op.get('/api/v1/notifications').set('X-Background-Request', '1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('POST /auth/logout reason', () => {
  it('records a client-side idle timeout as SESSION_TIMEOUT', async () => {
    const op = await as('operator');
    expect((await op.post('/api/v1/auth/logout', { reason: 'timeout' })).status).toBe(204);
    const row = await prisma.auditLog.findFirst({ where: { username: 'batt_op' }, orderBy: { seq: 'desc' } });
    expect(row?.action).toBe('SESSION_TIMEOUT');
    const session = await prisma.refreshToken.findUniqueOrThrow({ where: { id: sidOf(op.token) } });
    expect(session.revokedReason).toBe('idle_timeout');
  });

  it('a plain logout is still LOGOUT', async () => {
    const op = await as('operator');
    expect((await op.post('/api/v1/auth/logout')).status).toBe(204);
    const row = await prisma.auditLog.findFirst({ where: { username: 'batt_op' }, orderBy: { seq: 'desc' } });
    expect(row?.action).toBe('LOGOUT');
  });
});

describe('GET /reports/by-category breakdown (spec #19)', () => {
  it('adds high-severity counts and a subcategory breakdown that add up', async () => {
    const admin = await as('admin');
    const res = await admin.get('/api/v1/reports/by-category');
    expect(res.status).toBe(200);
    for (const c of res.body as { count: number; highSeverity: number; subcategories: { count: number }[] }[]) {
      expect(c.highSeverity).toBeLessThanOrEqual(c.count);
      expect(c.subcategories.reduce((n, s) => n + s.count, 0)).toBe(c.count);
    }
  });
});

describe('audit trail view logging (spec #24)', () => {
  let auditor: Client;
  beforeAll(async () => {
    auditor = await as('auditor');
  });
  const views = () => prisma.auditLog.count({ where: { action: 'VIEW_AUDIT_LOG', username: 'auditor' } });

  it('logs each distinct search with its filters, but not an identical repeat', async () => {
    const before = await views();
    await auditor.get('/api/v1/audit?q=teknaf');
    await auditor.get('/api/v1/audit?q=teknaf');
    expect(await views()).toBe(before + 1);
    const row = await prisma.auditLog.findFirst({ where: { action: 'VIEW_AUDIT_LOG', username: 'auditor' }, orderBy: { seq: 'desc' } });
    expect(row?.details).toContain('search "teknaf"');

    await auditor.get('/api/v1/audit?action=LOGIN');
    expect(await views()).toBe(before + 2);
  });
});
