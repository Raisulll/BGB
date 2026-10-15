import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, lastAudit, newIncident, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, sector: Client, operator: Client, verifier: Client, auditor: Client;

// The single-session rule ends earlier sessions on re-login, so log in once per user.
beforeAll(async () => {
  admin = await as('admin');
  sector = await as('sector');
  operator = await as('operator');
  verifier = await as('verifier');
  auditor = await as('auditor');
});
afterAll(() => prisma.$disconnect());

const URL = '/api/v1/incidents';

async function createSubmitted(overrides: Record<string, unknown> = {}) {
  const res = await operator.post(URL, { ...newIncident(overrides), status: 'Submitted' });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('listing, scope and visibility (specs #3, #15, #16)', () => {
  it('HQ sees every non-draft seeded incident; nobody sees other users\' drafts', async () => {
    const expected = await prisma.incident.count({ where: { status: { not: 'Draft' } } });
    const res = await admin.get(`${URL}?pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(expected);
    expect(res.body.data.every((i: { status: string }) => i.status !== 'Draft')).toBe(true);
  });

  it('limits a battalion operator to their battalion and a sector officer to their sector', async () => {
    const op = await operator.get(`${URL}?pageSize=100`);
    expect(op.body.data.length).toBeGreaterThan(0);
    expect(op.body.data.every((i: { battalion: string }) => i.battalion === '17 BGB')).toBe(true);

    const so = await sector.get(`${URL}?pageSize=100`);
    expect(so.body.data.every((i: { sector: string }) => i.sector === 'Sector-7')).toBe(true);
  });

  it('returns 404 (not 403) for incidents outside the user\'s scope', async () => {
    const outside = await prisma.incident.findFirst({ where: { sector: 'Sector-11', status: { not: 'Draft' } } });
    expect((await admin.get(`${URL}/${outside!.id}`)).status).toBe(200);
    expect((await sector.get(`${URL}/${outside!.id}`)).status).toBe(404);
  });

  it('filters by status, severity, reference number and date; paginates', async () => {
    const approved = await admin.get(`${URL}?status=Approved,Closed&pageSize=100`);
    expect(approved.body.data.every((i: { status: string }) => ['Approved', 'Closed'].includes(i.status))).toBe(true);

    const byRef = await admin.get(`${URL}?q=BIRDS-2026-1001`);
    expect(byRef.body.data[0].id).toBe('BIRDS-2026-1001');

    const dated = await admin.get(`${URL}?dateFrom=2026-10-20&dateTo=2026-10-22&pageSize=100`);
    expect(dated.body.data.every((i: { date: string }) => i.date >= '2026-10-20' && i.date <= '2026-10-22')).toBe(true);

    // Incident type (sub-category), spec #16
    const typed = await prisma.incident.findFirst({ where: { status: { not: 'Draft' }, subcategory: { not: null } } });
    const byType = await admin.get(`${URL}?subcategory=${encodeURIComponent(typed!.subcategory!)}&pageSize=100`);
    expect(byType.body.data.length).toBeGreaterThan(0);
    expect(byType.body.data.every((i: { subcategory: string }) => i.subcategory === typed!.subcategory)).toBe(true);

    const page = await admin.get(`${URL}?pageSize=5&page=2`);
    expect(page.body).toMatchObject({ page: 2, pageSize: 5 });
    expect(page.body.data).toHaveLength(5);

    expect((await admin.get(`${URL}?status=Bogus`)).status).toBe(400);
  });

  it('returns detail with timeline and evidence in the frontend shape', async () => {
    const res = await admin.get(`${URL}/BIRDS-2026-1001`);
    expect(res.body).toMatchObject({ id: 'BIRDS-2026-1001', date: '2026-10-15', time: '03:45', battalion: '17 BGB' });
    expect(res.body.timeline.map((t: { action: string }) => t.action)).toEqual(['Created', 'Submitted', 'Reviewed', 'Verified', 'Approved']);
    expect(res.body.evidence[0]).toMatchObject({ name: 'seizure_photo_01.jpg', mimeType: 'image/jpeg' });
  });
});

describe('create and edit (specs #5, #7, #9, #25)', () => {
  it('creates a draft with the next reference number and a Created timeline entry', async () => {
    const res = await operator.post(URL, newIncident());
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^BIRDS-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('Draft');
    expect(res.body.timeline.map((t: { action: string }) => t.action)).toEqual(['Created']);
    expect(res.body.canEdit).toBe(true);
    expect((await lastAudit('CREATE_INCIDENT'))?.details).toContain(res.body.id);

    const next = await operator.post(URL, newIncident());
    const seq = (id: string) => Number(id.split('-')[2]);
    expect(seq(next.body.id)).toBe(seq(res.body.id) + 1);
  });

  it('keeps drafts private to their creator', async () => {
    const draft = await operator.post(URL, newIncident());
    expect((await sector.get(`${URL}/${draft.body.id}`)).status).toBe(404);
    expect((await admin.get(`${URL}/${draft.body.id}`)).status).toBe(404);
  });

  it('rejects invalid hierarchy, out-of-scope units, future dates and bad classification', async () => {
    expect((await operator.post(URL, newIncident({ bop: 'BOP Benapole' }))).status).toBe(400); // not under 17 BGB
    expect((await operator.post(URL, newIncident({ sector: 'Sector-7', battalion: '34 BGB', bop: 'BOP Bandarban' }))).status).toBe(403);
    expect((await operator.post(URL, newIncident({ date: '2099-01-01' }))).status).toBe(400);
    expect((await operator.post(URL, newIncident({ subcategory: 'Gold' }))).status).toBe(400);
    expect((await operator.post(URL, newIncident({ severity: 'Extreme' }))).status).toBe(400);
    expect((await operator.post(URL, { ...newIncident(), status: 'Approved' })).status).toBe(400);
    expect((await operator.post(URL, { ...newIncident(), unknownField: 1 })).status).toBe(400);
  });

  it('enforces page permissions: auditors cannot create', async () => {
    expect((await auditor.post(URL, newIncident())).status).toBe(403);
    expect((await auditor.get(URL)).status).toBe(200);
  });

  it('lets only the creator edit, only while Draft/Returned', async () => {
    const draft = await operator.post(URL, newIncident());
    const edited = await operator.patch(`${URL}/${draft.body.id}`, { severity: 'High', title: 'Updated title for test' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ severity: 'High', title: 'Updated title for test' });
    expect(edited.body.timeline.at(-1)).toMatchObject({ action: 'Edited', notes: 'Changed: severity, title' });

    const approved = await prisma.incident.findFirst({ where: { status: 'Approved', battalion: '17 BGB' } });
    const blocked = await operator.patch(`${URL}/${approved!.id}`, { title: 'Tampering attempt' });
    expect(blocked.status).toBe(403);
    expect((await lastAudit('DENIED_UPDATE'))?.details).toContain(approved!.id);

    // Read-only roles never edit; a reviewer needs a reason (spec #14, below)
    const submitted = await createSubmitted();
    expect((await auditor.patch(`${URL}/${submitted}`, { title: 'Not mine to edit' })).status).toBe(403);
    expect((await sector.patch(`${URL}/${submitted}`, { title: 'Not mine to edit' })).status).toBe(400);
  });
});

describe('reviewer modifies a report before approval (spec #14)', () => {
  it('lets the reviewer at the current stage modify with a reason; audited field by field; filer notified', async () => {
    const id = await createSubmitted({ title: 'Original title of the report' });
    expect((await sector.get(`${URL}/${id}`)).body.canModify).toBe(true);
    expect((await operator.get(`${URL}/${id}`)).body).toMatchObject({ canModify: false, canEdit: false });
    expect((await auditor.get(`${URL}/${id}`)).body.canModify).toBe(false);

    const res = await sector.patch(`${URL}/${id}`, { title: 'Corrected title of the report', severity: 'Critical', reason: 'Severity understated' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Submitted', title: 'Corrected title of the report', severity: 'Critical' });
    expect(res.body.timeline.at(-1)).toMatchObject({ action: 'Modified by reviewer', notes: 'Changed: severity, title. Reason: Severity understated' });

    const audit = await lastAudit('MODIFY_INCIDENT');
    expect(audit?.details).toContain(id);
    expect(audit?.details).toContain('title: "Original title of the report" → "Corrected title of the report"');
    expect(audit?.details).toContain('Reason: Severity understated');
    expect(await prisma.notification.count({ where: { incidentId: id, userId: 'U003', title: 'Incident Modified' } })).toBe(1);

    // Unchanged values are not a modification
    expect((await sector.patch(`${URL}/${id}`, { severity: 'Critical', reason: 'No-op' })).status).toBe(400);
  });

  it('follows the workflow stage: the verifier modifies a Verified report; nobody modifies an approved one', async () => {
    const id = await createSubmitted();
    await sector.post(`${URL}/${id}/review`);
    await verifier.post(`${URL}/${id}/verify`);
    expect((await verifier.patch(`${URL}/${id}`, { outcome: 'Goods seized and handed over', reason: 'Outcome confirmed by BOP' })).status).toBe(200);

    await verifier.post(`${URL}/${id}/approve`);
    const blocked = await verifier.patch(`${URL}/${id}`, { outcome: 'Changed after approval', reason: 'Late correction' });
    expect(blocked.status).toBe(403);
    expect((await lastAudit('DENIED_UPDATE'))?.details).toContain(id);
  });

  it('never lets a reviewer modify their own report', async () => {
    const own = await admin.post(URL, { ...newIncident(), status: 'Submitted' });
    expect(own.body.canModify).toBe(false);
    expect((await admin.patch(`${URL}/${own.body.id}`, { title: 'Self-approved edit', reason: 'x' })).status).toBe(403);
  });
});

describe('workflow (specs #13, #14, #23, #25)', () => {
  it('runs the full lifecycle Draft → Submitted → Reviewed → Verified → Approved → Closed', async () => {
    const draft = await operator.post(URL, newIncident());
    const id = draft.body.id;

    const submitted = await operator.post(`${URL}/${id}/submit`);
    expect(submitted.body.status).toBe('Submitted');
    // Reviewers in scope are notified; the creator is not
    const notified = await prisma.notification.findMany({ where: { incidentId: id }, select: { userId: true } });
    expect(notified.map((n) => n.userId).sort()).toEqual(['U001', 'U002', 'U004']);

    expect((await sector.get(`${URL}/${id}`)).body.actions).toEqual(['review', 'return', 'reject']);
    expect((await sector.post(`${URL}/${id}/review`)).body.status).toBe('Reviewed');
    expect((await verifier.post(`${URL}/${id}/verify`)).body.status).toBe('Verified');
    expect((await verifier.post(`${URL}/${id}/approve`)).body.status).toBe('Approved');
    const closed = await admin.post(`${URL}/${id}/close`);
    expect(closed.body.status).toBe('Closed');
    expect(closed.body.timeline.map((t: { action: string }) => t.action)).toEqual([
      'Created', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed',
    ]);
    expect(closed.body.actions).toEqual([]);
  });

  it('blocks wrong roles (403), wrong states (409), and denials are audited', async () => {
    const id = await createSubmitted();
    expect((await sector.post(`${URL}/${id}/approve`)).status).toBe(403); // sector officers can't approve
    expect((await verifier.post(`${URL}/${id}/approve`)).status).toBe(409); // not Verified yet
    expect((await lastAudit('DENIED_WORKFLOW'))?.details).toContain(id);
    expect((await admin.post(`${URL}/${id}/explode`)).status).toBe(404);
  });

  it('enforces separation of duties: nobody reviews their own report', async () => {
    const own = await admin.post(URL, { ...newIncident(), status: 'Submitted' });
    expect(own.status).toBe(201);
    expect(own.body.actions).toEqual([]);
    const res = await admin.post(`${URL}/${own.body.id}/review`);
    expect(res.status).toBe(403);
  });

  it('requires a reason to return; the creator edits and resubmits', async () => {
    const id = await createSubmitted();
    expect((await sector.post(`${URL}/${id}/return`)).status).toBe(400);
    const returned = await sector.post(`${URL}/${id}/return`, { notes: 'Add GPS fix and persons involved' });
    expect(returned.body.status).toBe('Returned');
    expect(await prisma.notification.count({ where: { incidentId: id, userId: 'U003', type: 'return' } })).toBe(1);

    expect((await operator.patch(`${URL}/${id}`, { personsInvolved: '2 individuals' })).status).toBe(200);
    const resubmitted = await operator.post(`${URL}/${id}/submit`);
    expect(resubmitted.body.status).toBe('Submitted');
    expect(resubmitted.body.timeline.map((t: { action: string }) => t.action)).toEqual([
      'Created', 'Submitted', 'Returned', 'Edited', 'Resubmitted',
    ]);
  });

  it('lets exactly one of two simultaneous transitions win', async () => {
    const id = await createSubmitted();
    const [a, b] = await Promise.all([sector.post(`${URL}/${id}/review`), verifier.post(`${URL}/${id}/review`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const timeline = await prisma.incidentTimeline.count({ where: { incidentId: id, action: 'Reviewed' } });
    expect(timeline).toBe(1);
  });
});

describe('GIS and form metadata (specs #6, #8, #9, #18)', () => {
  it('returns map markers within scope and enforces the map permission', async () => {
    const res = await operator.get('/api/v1/gis/incidents');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((m: { battalion: string; lat: number }) => m.battalion === '17 BGB' && typeof m.lat === 'number')).toBe(true);
    expect((await auditor.get('/api/v1/gis/incidents')).status).toBe(403);
  });

  it('serves categories and the hierarchy the user may file under', async () => {
    const res = await operator.get(`${URL}/meta`);
    expect(res.body.categories).toHaveLength(7);
    expect(Object.keys(res.body.hierarchy)).toEqual(['Sector-7']);
    expect(Object.keys(res.body.hierarchy['Sector-7'])).toEqual(['17 BGB']);
    const hq = await admin.get(`${URL}/meta`);
    expect(Object.keys(hq.body.hierarchy).sort()).toEqual(['Sector-11', 'Sector-7']);
  });
});

describe('integrity', () => {
  it('audit chain is still intact after all workflow activity', async () => {
    const [row] = await prisma.$queryRaw<{ first_broken_seq: bigint | null }[]>`SELECT * FROM audit_log_verify()`;
    expect(row!.first_broken_seq).toBeNull();
  });
});
