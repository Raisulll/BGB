import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processOutbox } from '../src/modules/notifications/mailer.js';
import { as, lastAudit, newIncident, prisma } from './helpers.js';

// Spec #23 (workflow e-mail through the outbox) and specs #44/#45 (archiving + retention).
// MAIL_TRANSPORT=json in vitest.config.ts: messages are rendered, not sent.

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, operator: Client, sector: Client, auditor: Client;

beforeAll(async () => {
  [admin, operator, sector, auditor] = await Promise.all([as('admin'), as('operator'), as('sector'), as('auditor')]);
});

afterAll(async () => {
  // Leave the shared test database as other files expect it
  await prisma.incident.updateMany({ where: { archivedAt: { not: null } }, data: { archivedAt: null, archivedBy: null } });
  await prisma.$disconnect();
});

describe('workflow e-mail (spec #23)', () => {
  it('queues mail for reviewers on submission, with no incident details in the message', async () => {
    const created = await operator.post('/api/v1/incidents', newIncident({ title: 'Secret title for mail test', status: 'Submitted' }));
    expect(created.status).toBe(201);
    const rows = await prisma.emailOutbox.findMany({ where: { incidentId: created.body.id } });
    expect(rows.length).toBeGreaterThan(0);
    const recipients = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.toUserId!) } }, select: { role: true, username: true } });
    expect(recipients.every((u) => ['Sector Officer', 'Verifier/Approver', 'HQ Administrator'].includes(u.role))).toBe(true);
    expect(recipients.map((u) => u.username)).not.toContain('batt_op'); // the actor is never mailed
    for (const r of rows) {
      expect(r.subject).toBe(`[BIRDS] ${created.body.id} submitted for review`);
      expect(r.bodyText).toContain('CONFIDENTIAL // OPERATIONAL');
      expect(r.bodyText).toContain(`/incidents/${created.body.id}`);
      expect(r.bodyText).not.toContain('Secret title');
      expect(r.status).toBe('pending');
    }

    // One call sends one batch (oldest first), and other test files leave mail pending too: drain the queue
    let sent = 0;
    for (let r = await processOutbox(); r.sent > 0; r = await processOutbox()) sent += r.sent;
    expect(sent).toBeGreaterThanOrEqual(rows.length);
    const after = await prisma.emailOutbox.findMany({ where: { incidentId: created.body.id } });
    expect(after.every((r) => r.status === 'sent' && r.sentAt && r.attempts === 1)).toBe(true);
  });

  it('mails the creator on return, but sends nothing for a review step', async () => {
    const created = await operator.post('/api/v1/incidents', newIncident({ status: 'Submitted' }));
    const id = created.body.id as string;
    const before = await prisma.emailOutbox.count({ where: { incidentId: id } });

    expect((await sector.post(`/api/v1/incidents/${id}/review`)).status).toBe(200);
    expect(await prisma.emailOutbox.count({ where: { incidentId: id } })).toBe(before);

    expect((await sector.post(`/api/v1/incidents/${id}/return`, { notes: 'Add the patrol leader' })).status).toBe(200);
    const returned = await prisma.emailOutbox.findMany({ where: { incidentId: id, event: 'returned' } });
    expect(returned).toHaveLength(1);
    expect(returned[0]!.toUserId).toBe(operator.user.id);
    expect(returned[0]!.bodyText).not.toContain('patrol leader'); // reasons stay inside BIRDS
  });

  it('shows delivery status and sends a test message for admins only', async () => {
    expect((await auditor.get('/api/v1/admin/mail')).status).toBe(403);
    const status = await admin.get('/api/v1/admin/mail');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ enabled: true, transport: 'json' });
    expect(status.body.counts.sent).toBeGreaterThan(0);

    const test = await admin.post('/api/v1/admin/mail/test');
    expect(test.status).toBe(200);
    expect(test.body).toMatchObject({ to: 'rahman@bgb.gov.bd' });
    expect(test.body.sent).toBeGreaterThanOrEqual(1);
    expect((await lastAudit('MAIL_TEST'))?.details).toContain('sent');
  });
});

describe('archiving and retention (specs #44, #45)', () => {
  let closedId: string;
  beforeAll(async () => {
    closedId = (await prisma.incident.findFirstOrThrow({ where: { status: 'Closed' }, orderBy: { id: 'asc' } })).id;
  });

  it('refuses non-final incidents and non-admins', async () => {
    const submitted = await prisma.incident.findFirstOrThrow({ where: { status: 'Submitted' } });
    expect((await admin.post(`/api/v1/incidents/${submitted.id}/archive`)).status).toBe(409);
    expect((await sector.post(`/api/v1/incidents/${closedId}/archive`)).status).toBe(403);
    // The database refuses it too
    await expect(prisma.incident.update({ where: { id: submitted.id }, data: { archivedAt: new Date() } })).rejects.toThrow();
  });

  it('archives a closed incident: hidden from lists, still in statistics, read-only, timeline + audit', async () => {
    const totalBefore = (await admin.get('/api/v1/reports/summary')).body.total;

    const res = await admin.post(`/api/v1/incidents/${closedId}/archive`);
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).toBeTruthy();
    expect(res.body).toMatchObject({ actions: [], canEdit: false, canArchive: false, canRestore: true });
    // (seeded timeline entries carry future dates, so search rather than take the last entry)
    expect(res.body.timeline).toContainEqual(expect.objectContaining({ action: 'Archived', user: 'Col. Rahman' }));
    expect((await lastAudit('ARCHIVE_INCIDENT'))?.details).toContain(closedId);

    const list = await admin.get(`/api/v1/incidents?q=${closedId}`);
    expect(list.body.data.map((i: { id: string }) => i.id)).not.toContain(closedId);
    const only = await admin.get(`/api/v1/incidents?q=${closedId}&archived=only`);
    expect(only.body.data.map((i: { id: string }) => i.id)).toContain(closedId);
    expect((await admin.get(`/api/v1/incidents/${closedId}`)).status).toBe(200);

    expect((await admin.get('/api/v1/reports/summary')).body.total).toBe(totalBefore);
    expect((await admin.post(`/api/v1/incidents/${closedId}/archive`)).status).toBe(409);
  });

  it('restores with a reason only', async () => {
    expect((await admin.post(`/api/v1/incidents/${closedId}/unarchive`)).status).toBe(400);
    const res = await admin.post(`/api/v1/incidents/${closedId}/unarchive`, { notes: 'Reopened for court case' });
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).toBeNull();
    expect(res.body.timeline).toContainEqual(expect.objectContaining({ action: 'Restored from archive', notes: 'Reopened for court case' }));
    expect((await lastAudit('UNARCHIVE_INCIDENT'))?.details).toContain('Reopened for court case');
  });

  it('archives due final incidents in a run and reports the policy counts', async () => {
    // Make two final incidents look untouched for two years
    const finals = await prisma.incident.findMany({ where: { status: { in: ['Closed', 'Rejected'] }, archivedAt: null }, take: 2, orderBy: { id: 'asc' } });
    expect(finals.length).toBe(2);
    await prisma.$executeRaw`UPDATE incidents SET updated_at = now() - interval '730 days' WHERE id = ANY(${finals.map((f) => f.id)})`;

    const summary = await admin.get('/api/v1/admin/archive');
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ afterDays: 365, retentionDays: 3650 });
    expect(summary.body.dueForArchive).toBeGreaterThanOrEqual(2);

    const run = await admin.post('/api/v1/admin/archive/run');
    expect(run.status).toBe(200);
    expect(run.body.archived).toBeGreaterThanOrEqual(2);
    expect(run.body.summary.dueForArchive).toBe(0);
    const audit = await lastAudit('ARCHIVE_RUN');
    expect(audit?.details).toContain('Manual archiving run');
    expect(audit?.details).toContain(finals[0]!.id);

    const tl = await prisma.incidentTimeline.findFirst({ where: { incidentId: finals[0]!.id }, orderBy: { id: 'desc' } });
    expect(tl).toMatchObject({ action: 'Archived' });
    expect((await auditor.post('/api/v1/admin/archive/run')).status).toBe(403);
  });

  it('exposes archive.after_days as an editable setting', async () => {
    const cfg = await admin.get('/api/v1/admin/config');
    expect(cfg.body.find((c: { key: string }) => c.key === 'archive.after_days')).toMatchObject({ value: 365, editable: true, min: 30 });
    expect((await admin.patch('/api/v1/admin/config', { values: { 'archive.after_days': 10 } })).status).toBe(400);
  });
});
