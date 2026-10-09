import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { invalidateConfigCache } from '../src/modules/admin/config.service.js';
import { app, as, DEMO, lastAudit, newIncident, prisma } from './helpers.js';

// Related incidents, the duplicate check while filing, and the own-profile endpoints (specs #8, #16, #24, #28)

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client, sector: Client, auditor: Client;
const URL = '/api/v1/incidents';
// A quiet corner of the test data: no seeded incident is dated in March 2025 or sits at these coordinates
const BASE = { date: '2025-03-10', lat: 21.3, lng: 92.05, battalion: '17 BGB', sector: 'Sector-7' };

beforeAll(async () => {
  [operator, sector, auditor] = await Promise.all([as('operator'), as('sector'), as('auditor')]);
});
afterAll(async () => {
  await prisma.systemConfig.updateMany({ where: { key: 'session.single_session' }, data: { value: 'true' } });
  invalidateConfigCache();
  await prisma.$disconnect();
});

const file = async (o: Record<string, unknown>) => {
  const res = await operator.post(URL, newIncident({ status: 'Submitted', ...BASE, ...o }));
  expect(res.status).toBe(201);
  return res.body.id as string;
};
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('related incidents', () => {
  it('finds the same BOP or within 5 km, within 30 days, closest in time first', async () => {
    const main = await file({ title: 'Related: main', bop: 'BOP Ghumdhum' });
    const sameBop = await file({ title: 'Related: same BOP, 2 days later', bop: 'BOP Ghumdhum', date: '2025-03-12', lat: 21.6, lng: 92.4 });
    const near = await file({ title: 'Related: other BOP 1.1 km away', bop: 'BOP Himchari', date: '2025-03-20', lat: 21.31, lng: 92.05 });
    const farAway = await file({ title: 'Related: other BOP far away', bop: 'BOP Himchari', date: '2025-03-11', lat: 22.5, lng: 91.5 });
    const tooLate = await file({ title: 'Related: same BOP 40 days later', bop: 'BOP Ghumdhum', date: '2025-04-19' });

    const res = await sector.get(`${URL}/${main}/related`);
    expect(res.status).toBe(200);
    const found = ids(res.body);
    expect(found).toEqual(expect.arrayContaining([sameBop, near]));
    expect(found).not.toContain(farAway);
    expect(found).not.toContain(tooLate);
    expect(found).not.toContain(main);
    expect(found.indexOf(sameBop)).toBeLessThan(found.indexOf(near)); // 2 days apart before 10
    expect(res.body.find((r: { id: string }) => r.id === sameBop).match).toMatchObject({ daysApart: 2, sameBop: true });
    expect(res.body.find((r: { id: string }) => r.id === near).match).toMatchObject({ daysApart: 10, sameBop: false, distanceKm: 1.1 });
  });

  it('never shows other people\'s drafts', async () => {
    const main = await file({ title: 'Related: visible', bop: 'BOP Teknaf River', date: '2025-03-02' });
    const draft = await operator.post(URL, newIncident({ ...BASE, title: 'Related: private draft', bop: 'BOP Teknaf River', date: '2025-03-03' }));
    expect(ids((await sector.get(`${URL}/${main}/related`)).body)).not.toContain(draft.body.id);
    expect(ids((await operator.get(`${URL}/${main}/related`)).body)).toContain(draft.body.id); // the creator sees their own
  });
});

describe('duplicate check while filing', () => {
  it('flags reports within a day and 1 km, or same BOP + category without GPS', async () => {
    const existing = await file({ title: 'Duplicate: original', bop: 'BOP Teknaf', date: '2025-03-25', lat: 21.4, lng: 92.15 });

    const gps = await operator.get(`${URL}/similar?date=2025-03-26&lat=21.405&lng=92.15&bop=BOP%20Himchari&category=Smuggling`);
    expect(gps.status).toBe(200);
    expect(ids(gps.body)).toContain(existing);
    expect(gps.body.find((r: { id: string }) => r.id === existing).match.distanceKm).toBeLessThanOrEqual(1);

    const noGps = await operator.get(`${URL}/similar?date=2025-03-25&bop=BOP%20Teknaf&category=Illegal%20Crossing`);
    expect(ids(noGps.body)).toContain(existing);
    // Same BOP but another category and no GPS: not a likely duplicate
    expect(ids((await operator.get(`${URL}/similar?date=2025-03-25&bop=BOP%20Teknaf&category=Smuggling`)).body)).not.toContain(existing);
    // Three days later: not a duplicate
    expect(ids((await operator.get(`${URL}/similar?date=2025-03-28&lat=21.4&lng=92.15`)).body)).not.toContain(existing);
    // Editing the record itself never matches itself
    expect(ids((await operator.get(`${URL}/similar?date=2025-03-25&lat=21.4&lng=92.15&excludeId=${existing}`)).body)).not.toContain(existing);
  });

  it('is for roles that file incidents, and validates its input', async () => {
    expect((await auditor.get(`${URL}/similar?date=2025-03-25`)).status).toBe(403);
    expect((await operator.get(`${URL}/similar`)).status).toBe(400);
    expect((await operator.get(`${URL}/similar?date=2025-03-25&lat=123`)).status).toBe(400);
  });
});

describe('own profile', () => {
  it('shows the account, this session and recent sign-in events', async () => {
    const res = await operator.get('/api/v1/auth/profile');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'batt_op', role: 'Battalion Operator' });
    expect(res.body.user.lastLogin).toBeTruthy();
    expect(res.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(res.body.activity.some((a: { action: string }) => a.action === 'LOGIN')).toBe(true);
    // Only the caller's own security events, never other users' or incident actions
    expect(res.body.activity.every((a: { action: string }) => !a.action.includes('INCIDENT'))).toBe(true);
  });

  it('signs out other sessions on request', async () => {
    await prisma.systemConfig.upsert({ where: { key: 'session.single_session' }, update: { value: 'false' }, create: { key: 'session.single_session', value: 'false' } });
    invalidateConfigCache(); // the setting is cached for 30 s per process
    const second = await request(app).post('/api/v1/auth/login').send(DEMO.verifier);
    const first = await as('verifier');
    expect(await prisma.refreshToken.count({ where: { userId: first.user.id, revoked: false } })).toBeGreaterThanOrEqual(2);

    const res = await first.post('/api/v1/auth/sessions/revoke-others');
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBeGreaterThanOrEqual(1);
    expect(await prisma.refreshToken.count({ where: { userId: first.user.id, revoked: false } })).toBe(1);
    expect((await request(app).get('/api/v1/auth/profile').set('Authorization', `Bearer ${second.body.accessToken}`)).status).toBe(401);
    expect((await lastAudit('SESSIONS_REVOKED'))?.details).toContain('other session');
  });
});
