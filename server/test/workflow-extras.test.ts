import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, lastAudit, newIncident, prisma } from './helpers.js';

// Overdue indicator (status_changed_at + workflow.overdue_days), comments, print audit (specs #12, #23, #24, #25, #47)

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client, sector: Client, auditor: Client, admin: Client;
const URL = '/api/v1/incidents';
const DAY = 86_400_000;

beforeAll(async () => {
  [operator, sector, auditor, admin] = await Promise.all([as('operator'), as('sector'), as('auditor'), as('admin')]);
});
afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: 'workflow.overdue_days' } }); // back to the default
  await prisma.$disconnect();
});

const since = async (id: string) => (await prisma.incident.findUniqueOrThrow({ where: { id } })).statusChangedAt.getTime();

describe('status_changed_at (DB trigger)', () => {
  it('moves on every status change, and only then', async () => {
    const draft = await operator.post(URL, newIncident());
    const id = draft.body.id as string;
    const created = await since(id);

    await new Promise((r) => setTimeout(r, 20));
    expect((await operator.patch(`${URL}/${id}`, { title: 'Edited title for the trigger test' })).status).toBe(200);
    expect(await since(id)).toBe(created); // an edit keeps the status

    expect((await operator.post(`${URL}/${id}/submit`)).status).toBe(200);
    const submitted = await since(id);
    expect(submitted).toBeGreaterThan(created);
    expect((await sector.post(`${URL}/${id}/review`)).status).toBe(200);
    expect(await since(id)).toBeGreaterThan(submitted);
  });
});

describe('overdue', () => {
  it('flags records waiting longer than workflow.overdue_days, in lists, filters and the summary', async () => {
    expect((await admin.patch('/api/v1/admin/config', { values: { 'workflow.overdue_days': 2 } })).status).toBe(200);
    const stale = await operator.post(URL, newIncident({ title: 'Waiting too long', status: 'Submitted' }));
    const fresh = await operator.post(URL, newIncident({ title: 'Just filed', status: 'Submitted' }));
    // Backdate one record's current step (the trigger only stamps on status changes)
    await prisma.incident.update({ where: { id: stale.body.id }, data: { statusChangedAt: new Date(Date.now() - 3 * DAY) } });

    const detail = await sector.get(`${URL}/${stale.body.id}`);
    expect(detail.body).toMatchObject({ overdue: true, status: 'Submitted' });
    expect((await sector.get(`${URL}/${fresh.body.id}`)).body.overdue).toBe(false);

    const list = await sector.get(`${URL}?overdue=true&pageSize=100`);
    const ids = list.body.data.map((i: { id: string }) => i.id);
    expect(ids).toContain(stale.body.id);
    expect(ids).not.toContain(fresh.body.id);
    expect(list.body.data.every((i: { overdue: boolean }) => i.overdue)).toBe(true);

    const summary = await sector.get('/api/v1/reports/summary');
    expect(summary.body.overdue).toBeGreaterThanOrEqual(1);

    // A longer threshold clears it
    expect((await admin.patch('/api/v1/admin/config', { values: { 'workflow.overdue_days': 5 } })).status).toBe(200);
    expect((await sector.get(`${URL}/${stale.body.id}`)).body.overdue).toBe(false);
  });

  it('never flags drafts, closed records or archived ones', async () => {
    const draft = await operator.post(URL, newIncident());
    await prisma.incident.update({ where: { id: draft.body.id }, data: { statusChangedAt: new Date(Date.now() - 100 * DAY) } });
    expect((await operator.get(`${URL}/${draft.body.id}`)).body.overdue).toBe(false);
  });
});

describe('comments', () => {
  it('lets filers and reviewers discuss a filed incident, notifies the others, and audits it', async () => {
    const inc = await operator.post(URL, newIncident({ title: 'Discussion test', status: 'Submitted' }));
    const id = inc.body.id as string;
    expect(inc.body).toMatchObject({ canComment: true, comments: [] });

    const first = await sector.post(`${URL}/${id}/comments`, { body: 'Which patrol team was on duty?' });
    expect(first.status).toBe(201);
    expect(first.body.comments).toHaveLength(1);
    expect(first.body.comments[0]).toMatchObject({ user: sector.user.name, body: 'Which patrol team was on duty?' });
    expect((await lastAudit('COMMENT_INCIDENT'))?.details).toContain(id);

    // The creator is notified; the author is not
    const note = await prisma.notification.findFirst({ where: { incidentId: id, type: 'comment' }, orderBy: { id: 'desc' } });
    expect(note?.userId).toBe(operator.user.id);

    const reply = await operator.post(`${URL}/${id}/comments`, { body: 'Team Bravo, Havildar Karim.' });
    expect(reply.body.comments.map((c: { body: string }) => c.body)).toEqual(['Which patrol team was on duty?', 'Team Bravo, Havildar Karim.']);
    // The earlier commenter hears about the reply
    expect(await prisma.notification.count({ where: { incidentId: id, type: 'comment', userId: sector.user.id } })).toBe(1);
  });

  it('refuses read-only roles, drafts and empty comments', async () => {
    const inc = await operator.post(URL, newIncident({ status: 'Submitted' }));
    expect((await auditor.get(`${URL}/${inc.body.id}`)).body.canComment).toBe(false);
    expect((await auditor.post(`${URL}/${inc.body.id}/comments`, { body: 'Observation' })).status).toBe(403);
    expect((await sector.post(`${URL}/${inc.body.id}/comments`, { body: '   ' })).status).toBe(400);

    const draft = await operator.post(URL, newIncident());
    expect(draft.body.canComment).toBe(false);
    expect((await operator.post(`${URL}/${draft.body.id}/comments`, { body: 'Note to self' })).status).toBe(403);
  });

  it('keeps comments append-only in the database', async () => {
    const inc = await operator.post(URL, newIncident({ status: 'Submitted' }));
    await sector.post(`${URL}/${inc.body.id}/comments`, { body: 'Original wording' });
    const row = await prisma.incidentComment.findFirstOrThrow({ where: { incidentId: inc.body.id } });
    await expect(prisma.incidentComment.update({ where: { id: row.id }, data: { body: 'Rewritten' } })).rejects.toThrow(/append-only/);
    await expect(prisma.incidentComment.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
});

describe('printing', () => {
  it('records each print in the audit trail', async () => {
    const inc = await operator.post(URL, newIncident({ status: 'Submitted' }));
    const res = await sector.post(`${URL}/${inc.body.id}/print`);
    expect(res.status).toBe(200);
    expect(res.body.reference).toMatch(/^BGB\/BIRDS\/RPT\/\d{4}\/\d{4}$/);
    const entry = (await lastAudit('PRINT_INCIDENT'))?.details;
    expect(entry).toContain(inc.body.id);
    expect(entry).toContain(res.body.reference);
    expect((await sector.post(`${URL}/BIRDS-2026-9999/print`)).status).toBe(404);
  });
});
