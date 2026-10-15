import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { htmlDisguisedAsJpeg, jpegWithExif } from './fixtures.js';
import { as, lastAudit, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, sector: Client, operator: Client, verifier: Client, auditor: Client;

beforeAll(async () => {
  admin = await as('admin');
  sector = await as('sector');
  operator = await as('operator');
  verifier = await as('verifier');
  auditor = await as('auditor');
});
afterAll(() => prisma.$disconnect());

const URL = '/api/v1/alerts';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Active users serving in these sectors (their sector, battalions or BOPs) or at HQ, except the sender — computed independently of the service */
async function expectedRecipients(sectors: string[], senderId: string) {
  const org = await prisma.orgHierarchy.findMany({ where: { sector: { in: sectors } } });
  const units = new Set(['HQ', ...sectors, ...org.map((o) => o.battalion), ...org.map((o) => o.bop)]);
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, scope: true } });
  return users.filter((u) => units.has(u.scope) && u.id !== senderId).map((u) => u.id).sort();
}

const alertData = (overrides: Record<string, unknown> = {}) => ({
  title: 'Armed smuggler expected to cross at Naf river tonight',
  threatType: 'wanted_person',
  priority: 'flash',
  subjectName: 'Karim "Kala" Mia',
  subjectDescription: 'About 35, tall, scar on left cheek, black jacket; travels with two others',
  details: 'Intelligence indicates he will attempt to cross from Myanmar between 01:00 and 03:00 near pillar 12 with a consignment of Yaba.',
  instructions: 'Increase patrols at pillars 10–14, stop and search boats, report sightings immediately.',
  lastSeenAt: '2026-10-14T18:00:00+06:00',
  lastSeenPlace: 'Maungdaw jetty',
  lat: 20.87,
  lng: 92.27,
  targetSectors: ['Sector-7'],
  validHours: 24,
  declaration: true,
  ...overrides,
});

/** Raises an alert (multipart: data + optional files) */
const raise = (client: Client, data: Record<string, unknown>, files: [Buffer, string, string][] = []) => client.upload(URL, files).field('data', JSON.stringify(data));

describe('raising a Flash Alert', () => {
  it('needs the raise_alert permission (HQ administrators and sector officers by default)', async () => {
    expect((await raise(operator, alertData())).status).toBe(403);
    expect((await raise(verifier, alertData())).status).toBe(403);
    const perms = await admin.get('/api/v1/admin/roles/permissions');
    expect(perms.body.pageIds).toContain('raise_alert');
    expect(perms.body.permissions['Sector Officer']).toContain('raise_alert');
    expect(perms.body.permissions['Battalion Operator']).not.toContain('raise_alert');
  });

  it('requires the false-alert declaration, a known sector and an offered validity', async () => {
    expect((await raise(sector, alertData({ declaration: false }))).status).toBe(400);
    expect((await raise(sector, alertData({ targetSectors: ['Sector-99'] }))).status).toBe(400);
    expect((await raise(sector, alertData({ validHours: 5 }))).status).toBe(400);
    expect((await raise(sector, alertData({ lat: 20.8, lng: null }))).status).toBe(400);
  });

  it('refuses a disguised file and stores nothing', async () => {
    const before = await prisma.flashAlert.count();
    const res = await raise(sector, alertData(), [[htmlDisguisedAsJpeg(), 'photo.jpg', 'image/jpeg']]);
    expect(res.status).toBe(415);
    expect(await prisma.flashAlert.count()).toBe(before);
    expect((await lastAudit('UPLOAD_REJECTED'))?.details).toContain('Flash Alert');
  });

  it('delivers to everyone in the target sectors and at HQ, with evidence, and is audited', async () => {
    const photo = jpegWithExif();
    const res = await raise(sector, alertData(), [[photo, 'suspect.jpg', 'image/jpeg']]);
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^FA-\d{4}-\d{4}$/);
    expect(res.body).toMatchObject({ state: 'active', priority: 'flash', targetSectors: ['Sector-7'], sender: { name: expect.any(String) } });
    expect(res.body.attachments[0]).toMatchObject({ name: 'suspect.jpg', mimeType: 'image/jpeg', sha256: sha(photo) });
    // Sector-7 officers (batt_op, verifier, ...) and HQ (admin, auditor); not the sender
    const recipients = (await prisma.flashAlertRecipient.findMany({ where: { alertId: res.body.id }, select: { userId: true } })).map((r) => r.userId).sort();
    expect(recipients).toEqual(await expectedRecipients(['Sector-7'], 'U002'));
    expect(recipients).toEqual(expect.arrayContaining(['U001', 'U003', 'U004', 'U005']));
    expect(recipients).not.toContain('U002');
    expect(res.body.counts).toMatchObject({ recipients: recipients.length, acknowledged: 0 });
    expect(res.body.recipientList).toHaveLength(recipients.length); // the sender sees the list
    const audit = await lastAudit('RAISE_FLASH_ALERT');
    expect(audit?.details).toContain(res.body.reference);
    expect(audit?.details).toContain('False-alert declaration accepted');
  });

  it('reaches only the chosen sectors: Sector-11 alerts are not sent to Sector-7 officers', async () => {
    const res = await raise(admin, alertData({ targetSectors: ['Sector-11'], title: 'Cattle smuggling group moving towards Sector-11' }));
    expect(res.status).toBe(201);
    expect((await operator.get(`${URL}/${res.body.id}`)).status).toBe(404);
    expect((await operator.get(`${URL}/active`)).body.some((a: { id: number }) => a.id === res.body.id)).toBe(false);
    // HQ-level users (the auditor) receive every alert
    expect((await auditor.get(`${URL}/active`)).body.some((a: { id: number }) => a.id === res.body.id)).toBe(true);
  });
});

describe('receiving and acknowledging', () => {
  it('records delivery when the alert is fetched and acknowledgement once; the sender sees progress', async () => {
    const raised = (await raise(sector, alertData({ title: 'Human trafficking group expected near BOP Teknaf' }))).body;
    const active = await operator.get(`${URL}/active`);
    const mine = active.body.find((a: { id: number }) => a.id === raised.id);
    expect(mine.me).toMatchObject({ recipient: true, acknowledgedAt: null });
    expect(mine.me.deliveredAt).not.toBeNull();
    expect(mine.recipientList).toBeUndefined(); // recipients don't see who else acknowledged

    const ack = await operator.post(`${URL}/${raised.id}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.me.acknowledgedAt).not.toBeNull();
    const again = await operator.post(`${URL}/${raised.id}/acknowledge`);
    expect(again.body.me.acknowledgedAt).toBe(ack.body.me.acknowledgedAt);
    expect((await lastAudit('ACKNOWLEDGE_FLASH_ALERT'))?.details).toContain(raised.reference);

    const progress = await sector.get(`${URL}/${raised.id}`);
    expect(progress.body.counts.acknowledged).toBe(1);
    expect(progress.body.recipientList.find((r: { userId: string }) => r.userId === 'U003').acknowledgedAt).not.toBeNull();
    // The sender is not a recipient and has nothing to acknowledge
    expect((await sector.post(`${URL}/${raised.id}/acknowledge`)).status).toBe(403);
  });

  it('keeps delivery and acknowledgement permanent at database level', async () => {
    const row = await prisma.flashAlertRecipient.findFirst({ where: { acknowledgedAt: { not: null } } });
    await expect(prisma.flashAlertRecipient.update({ where: { alertId_userId: { alertId: row!.alertId, userId: row!.userId } }, data: { acknowledgedAt: null } })).rejects.toThrow();
    await expect(prisma.flashAlertRecipient.delete({ where: { alertId_userId: { alertId: row!.alertId, userId: row!.userId } } })).rejects.toThrow();
  });

  it('serves attachments to recipients with an integrity check, audited; not to others', async () => {
    const photo = jpegWithExif();
    const raised = (await raise(sector, alertData({ title: 'Suspect photographed at the crossing point' }), [[photo, 'suspect.jpg', 'image/jpeg']])).body;
    const att = raised.attachments[0];
    const file = await verifier.get(`${URL}/${raised.id}/attachments/${att.id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(sha(file.body as Buffer)).toBe(sha(photo));
    expect((await lastAudit('VIEW_ALERT_ATTACHMENT'))?.details).toContain(raised.reference);

    const other = (await raise(admin, alertData({ targetSectors: ['Sector-11'], title: 'Sector-11 only alert with a photo' }), [[photo, 'x.jpg', 'image/jpeg']])).body;
    expect((await operator.get(`${URL}/${other.id}/attachments/${other.attachments[0].id}`)).status).toBe(404);
  });
});

describe('updates and closing', () => {
  it('lets the sender post updates; others are refused and audited; updates are append-only', async () => {
    const raised = (await raise(sector, alertData({ title: 'Boat with armed men sighted near Shah Porir Dwip' }))).body;
    const denied = await operator.post(`${URL}/${raised.id}/updates`, { body: 'Not my alert' });
    expect(denied.status).toBe(403);
    expect((await lastAudit('DENIED_FLASH_ALERT'))?.details).toContain(raised.reference);

    const upd = await sector.post(`${URL}/${raised.id}/updates`, { body: 'Sighted 2 km north of pillar 12 at 01:40, moving south.' });
    expect(upd.status).toBe(201);
    expect(upd.body.updates.at(-1)).toMatchObject({ kind: 'update', body: 'Sighted 2 km north of pillar 12 at 01:40, moving south.' });
    const row = await prisma.flashAlertUpdate.findFirst({ where: { alertId: raised.id } });
    await expect(prisma.flashAlertUpdate.delete({ where: { id: row!.id } })).rejects.toThrow();
  });

  it('resolves or cancels with a note (sender or HQ administrator); a closed alert takes no more updates', async () => {
    const raised = (await raise(sector, alertData({ title: 'Wanted person heading to BOP Ghumdhum' }))).body;
    expect((await admin.post(`${URL}/${raised.id}/resolve`, {})).status).toBe(400);
    const resolved = await admin.post(`${URL}/${raised.id}/resolve`, { notes: 'Apprehended at 02:15 by BOP Ghumdhum patrol.' });
    expect(resolved.body).toMatchObject({ state: 'resolved', closeNote: 'Apprehended at 02:15 by BOP Ghumdhum patrol.' });
    expect((await sector.post(`${URL}/${raised.id}/updates`, { body: 'Late update' })).status).toBe(409);
    expect((await sector.post(`${URL}/${raised.id}/cancel`, { notes: 'Too late' })).status).toBe(409);
    expect((await operator.get(`${URL}/active`)).body.some((a: { id: number }) => a.id === raised.id)).toBe(false);

    const wrong = (await raise(sector, alertData({ title: 'Alert raised by mistake for testing' }))).body;
    const cancelled = await sector.post(`${URL}/${wrong.id}/cancel`, { notes: 'Raised in error: information not confirmed.' });
    expect(cancelled.body.state).toBe('cancelled');
    expect((await lastAudit('CANCEL_FLASH_ALERT'))?.details).toContain('Raised in error');
  });

  it('expires by itself at the end of its validity', async () => {
    const raised = (await raise(sector, alertData({ title: 'Short-lived alert for the expiry check', validHours: 6 }))).body;
    await prisma.flashAlert.update({ where: { id: raised.id }, data: { createdAt: new Date(Date.now() - 8 * 3_600_000), validUntil: new Date(Date.now() - 3_600_000) } });
    expect((await sector.get(`${URL}/${raised.id}`)).body.state).toBe('expired');
    expect((await operator.get(`${URL}/active`)).body.some((a: { id: number }) => a.id === raised.id)).toBe(false);
    const closed = await operator.get(`${URL}?state=closed&pageSize=100`);
    expect(closed.body.data.some((a: { id: number }) => a.id === raised.id)).toBe(true);
  });

  it('offers every sector to the sender, not only their own', async () => {
    const opts = await sector.get(`${URL}/options`);
    expect(opts.body.sectors).toEqual(expect.arrayContaining(['Sector-7', 'Sector-11']));
    expect(opts.body.validHours).toContain(24);
  });

  it('previews how many officers an area reaches', async () => {
    expect((await sector.get(`${URL}/preview?sectors=Sector-7`)).body.recipients).toBe((await expectedRecipients(['Sector-7'], 'U002')).length);
    expect((await operator.get(`${URL}/preview?sectors=Sector-7`)).status).toBe(403);
  });
});
