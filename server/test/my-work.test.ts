import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, lastAudit, newIncident, prisma } from './helpers.js';

// "My incidents / My drafts / Needs my action" views and discarding drafts (specs #5, #13, #16, #25)

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client, sector: Client, verifier: Client, auditor: Client, admin: Client;
const URL = '/api/v1/incidents';

beforeAll(async () => {
  [operator, sector, verifier, auditor, admin] = await Promise.all([as('operator'), as('sector'), as('verifier'), as('auditor'), as('admin')]);
});
afterAll(() => prisma.$disconnect());

const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((i) => i.id);

describe('My incidents / My drafts', () => {
  it('createdBy=me lists only the caller\'s records, drafts included', async () => {
    const draft = await operator.post(URL, newIncident({ title: 'Mine, draft' }));
    const res = await operator.get(`${URL}?createdBy=me&pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((i: { createdBy: string }) => i.createdBy === operator.user.id)).toBe(true);
    expect(ids(res)).toContain(draft.body.id);

    const drafts = await operator.get(`${URL}?createdBy=me&status=Draft&pageSize=100`);
    expect(drafts.body.data.every((i: { status: string }) => i.status === 'Draft')).toBe(true);
    expect(ids(drafts)).toContain(draft.body.id);
  });
});

describe('Needs my action', () => {
  it('shows reviewers what they can move on, never their own reports', async () => {
    const submitted = await operator.post(URL, newIncident({ title: 'Awaiting review', status: 'Submitted' }));
    const res = await sector.get(`${URL}?needsAction=true&pageSize=100`);
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(submitted.body.id);
    for (const i of res.body.data as { status: string; createdBy: string; actions: string[] }[]) {
      if (i.createdBy === sector.user.id) expect(i.status).toBe('Returned');
      else expect(i.actions.length).toBeGreaterThan(0); // every row is actionable by the caller
    }
    // An operator has no review role: someone else's submitted report is never on their list
    expect(ids(await operator.get(`${URL}?needsAction=true&pageSize=100`))).not.toContain(submitted.body.id);
    // Moves with the workflow: once Verified it's the verifier's (approve), and a Sector Officer can still return/reject
    expect((await sector.post(`${URL}/${submitted.body.id}/review`)).status).toBe(200);
    expect((await verifier.post(`${URL}/${submitted.body.id}/verify`)).status).toBe(200);
    expect(ids(await verifier.get(`${URL}?needsAction=true&pageSize=100`))).toContain(submitted.body.id);
    expect(ids(await sector.get(`${URL}?needsAction=true&pageSize=100`))).toContain(submitted.body.id);
    // Approved: only HQ can close it; it leaves the reviewers' lists
    expect((await verifier.post(`${URL}/${submitted.body.id}/approve`)).status).toBe(200);
    expect(ids(await sector.get(`${URL}?needsAction=true&pageSize=100`))).not.toContain(submitted.body.id);
    expect(ids(await admin.get(`${URL}?needsAction=true&pageSize=100`))).toContain(submitted.body.id);
  });

  it('shows the filer their own returned reports', async () => {
    const inc = await operator.post(URL, newIncident({ title: 'Will be returned', status: 'Submitted' }));
    expect((await sector.post(`${URL}/${inc.body.id}/return`, { notes: 'Add the GPS fix' })).status).toBe(200);
    expect(ids(await operator.get(`${URL}?needsAction=true&pageSize=100`))).toContain(inc.body.id);
  });

  it('tells the client whether the role reviews or approves (meta.canAct)', async () => {
    expect((await sector.get(`${URL}/meta`)).body.canAct).toBe(true);
    expect((await operator.get(`${URL}/meta`)).body.canAct).toBe(false);
    expect((await auditor.get(`${URL}/meta`)).body.canAct).toBe(false);
  });
});

describe('Discarding a draft', () => {
  it('lets the creator discard a never-submitted draft: hidden everywhere, kept on record, audited', async () => {
    const draft = await operator.post(URL, newIncident({ title: 'Started by mistake' }));
    const id = draft.body.id as string;
    expect(draft.body.canDiscard).toBe(true);

    expect((await operator.delete(`${URL}/${id}`, { notes: 'Duplicate of an earlier report' })).status).toBe(204);
    expect((await operator.get(`${URL}/${id}`)).status).toBe(404);
    expect(ids(await operator.get(`${URL}?createdBy=me&pageSize=100`))).not.toContain(id);
    expect((await operator.patch(`${URL}/${id}`, { title: 'Edited after discarding' })).status).toBe(404);
    expect((await operator.post(`${URL}/${id}/submit`)).status).toBe(404);

    const row = await prisma.incident.findUniqueOrThrow({ where: { id }, include: { timeline: true } });
    expect(row.discardedAt).not.toBeNull();
    expect(row.discardedBy).toBe(operator.user.id);
    expect(row.timeline.at(-1)).toMatchObject({ action: 'Discarded', notes: 'Duplicate of an earlier report' });
    expect((await lastAudit('DISCARD_DRAFT'))?.details).toContain(id);
  });

  it('refuses anything that was submitted, and anyone but the creator', async () => {
    const submitted = await operator.post(URL, newIncident({ status: 'Submitted' }));
    expect(submitted.body.canDiscard).toBe(false);
    const res = await operator.delete(`${URL}/${submitted.body.id}`);
    expect(res.status).toBe(409);
    // Other users can't see someone else's draft at all
    const draft = await operator.post(URL, newIncident());
    expect((await admin.delete(`${URL}/${draft.body.id}`)).status).toBe(404);
    expect((await auditor.delete(`${URL}/${draft.body.id}`)).status).toBe(403); // no "create" permission
  });

  it('is enforced by the database too: only a Draft can be marked discarded', async () => {
    const submitted = await operator.post(URL, newIncident({ status: 'Submitted' }));
    await expect(prisma.incident.update({ where: { id: submitted.body.id }, data: { discardedAt: new Date() } })).rejects.toThrow();
  });
});
