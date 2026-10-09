import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, newIncident, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let sector: Client, operator: Client, verifier: Client;

beforeAll(async () => {
  sector = await as('sector');
  operator = await as('operator');
  verifier = await as('verifier');
});
afterAll(() => prisma.$disconnect());

describe('notifications (spec #23)', () => {
  it('seeded notifications are per user, only for incidents in their scope', async () => {
    expect(await prisma.notification.count({ where: { userId: null } })).toBe(0);
    const res = await sector.get('/api/v1/notifications?pageSize=100');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((n: { id: number }) => n.id);
    const owners = await prisma.notification.findMany({ where: { id: { in: ids } }, select: { userId: true } });
    expect(owners.every((o) => o.userId === 'U002')).toBe(true);
    const incidentIds = res.body.data.map((n: { incidentId: string }) => n.incidentId).filter(Boolean);
    const sectors = await prisma.incident.findMany({ where: { id: { in: incidentIds } }, select: { sector: true } });
    expect(sectors.every((s) => s.sector === 'Sector-7')).toBe(true);
  });

  it('a submission notifies the reviewer, who can mark it read', async () => {
    const before = (await sector.get('/api/v1/notifications')).body.unreadCount;
    const created = await operator.post('/api/v1/incidents', { ...newIncident(), status: 'Submitted' });

    const after = await sector.get('/api/v1/notifications?unread=true');
    expect(after.body.unreadCount).toBe(before + 1);
    const n = after.body.data.find((x: { incidentId: string }) => x.incidentId === created.body.id);
    expect(n).toMatchObject({ title: 'New Incident Submitted', type: 'submission', read: false });

    expect((await sector.patch(`/api/v1/notifications/${n.id}/read`)).status).toBe(204);
    expect((await sector.get('/api/v1/notifications')).body.unreadCount).toBe(before);
  });

  it('cannot touch someone else\'s notifications', async () => {
    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: 'U002' } });
    expect((await verifier.patch(`/api/v1/notifications/${theirs.id}/read`)).status).toBe(404);
  });

  it('marks everything read', async () => {
    const res = await verifier.patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(200);
    expect((await verifier.get('/api/v1/notifications')).body.unreadCount).toBe(0);
    // other users are unaffected
    expect(await prisma.notification.count({ where: { userId: 'U001', isRead: false } })).toBeGreaterThan(0);
  });
});
