import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bigJpeg, htmlDisguisedAsJpeg, jpegWithExif, pdf, png } from './fixtures.js';
import { app, as, lastAudit, newIncident, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, sector: Client, operator: Client;

beforeAll(async () => {
  admin = await as('admin');
  sector = await as('sector');
  operator = await as('operator');
});
afterAll(() => prisma.$disconnect());

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const draft = async () => (await operator.post('/api/v1/incidents', newIncident())).body.id as string;
const ev = (id: string) => `/api/v1/incidents/${id}/evidence`;

describe('upload (specs #10, #11)', () => {
  it('stores files with SHA-256, EXIF + GPS metadata, UTF-8 names and a timeline entry', async () => {
    const id = await draft();
    const jpg = jpegWithExif();
    const res = await operator
      .upload(ev(id), [
        [jpg, 'প্রমাণ_ছবি.jpg', 'image/jpeg'],
        [pdf(), 'seizure-report.pdf', 'application/pdf'],
      ])
      .field('lastModified', String(Date.UTC(2026, 9, 1, 3, 0)))
      .field('lastModified', '2026-10-01T03:05:00Z');

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    const [photo, doc] = res.body;
    expect(photo).toMatchObject({ name: 'প্রমাণ_ছবি.jpg', mimeType: 'image/jpeg', size: jpg.length, sha256: sha(jpg), available: true });
    expect(photo.metadata.exif.Make).toBe('BGBCam');
    expect(photo.metadata.gps.latitude).toBeCloseTo(20.8667, 3);
    expect(photo.metadata.gps.longitude).toBeCloseTo(92.2667, 3);
    expect(photo.metadata.clientLastModified).toBe('2026-10-01T03:00:00.000Z');
    expect(photo.metadata.scan.status).toBe('not_scanned');
    expect(doc).toMatchObject({ mimeType: 'application/pdf' });

    const detail = await operator.get(`/api/v1/incidents/${id}`);
    expect(detail.body.timeline.at(-1)).toMatchObject({ action: 'Evidence added', notes: 'প্রমাণ_ছবি.jpg, seizure-report.pdf' });
    expect((await lastAudit('UPLOAD_EVIDENCE'))?.details).toContain(sha(jpg).slice(0, 16));
  });

  it('checks real file content: an HTML file named .jpg is rejected and nothing is stored', async () => {
    const id = await draft();
    const res = await operator.upload(ev(id), [[htmlDisguisedAsJpeg(), 'photo.jpg', 'image/jpeg']]);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await prisma.evidence.count({ where: { incidentId: id } })).toBe(0);
    expect((await lastAudit('UPLOAD_REJECTED'))?.details).toContain('photo.jpg');
  });

  it('rejects one bad file without storing the good ones in the same batch', async () => {
    const id = await draft();
    const res = await operator.upload(ev(id), [
      [png(), 'ok.png', 'image/png'],
      [Buffer.from('MZ fake executable payload'), 'tool.pdf', 'application/pdf'],
    ]);
    expect(res.status).toBe(415);
    expect(await prisma.evidence.count({ where: { incidentId: id } })).toBe(0);
  });

  it('enforces the per-file size limit (413) and requires at least one file', async () => {
    const id = await draft();
    const big = await operator.upload(ev(id), [[bigJpeg(1.5), 'huge.jpg', 'image/jpeg']]);
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('LIMIT_FILE_SIZE');
    expect((await operator.upload(ev(id), [])).status).toBe(400);
  });

  it('only the creator may upload, and only while Draft/Returned', async () => {
    const submitted = (await operator.post('/api/v1/incidents', { ...newIncident(), status: 'Submitted' })).body.id;
    expect((await operator.upload(ev(submitted), [[png(), 'late.png', 'image/png']])).status).toBe(403);
    expect((await sector.upload(ev(submitted), [[png(), 'x.png', 'image/png']])).status).toBe(403);
    expect((await lastAudit('DENIED_UPDATE'))?.details).toContain(submitted);
  });

  it('rejects unauthenticated uploads before reading the body', async () => {
    const id = await draft();
    const res = await request(app).post(ev(id)).attach('files', png(), 'x.png');
    expect(res.status).toBe(401);
  });
});

describe('download, verification and visibility', () => {
  it('streams the exact bytes back with type, digest and a safe Content-Disposition', async () => {
    const id = await draft();
    const jpg = jpegWithExif();
    const [item] = (await operator.upload(ev(id), [[jpg, 'প্রমাণ.jpg', 'image/jpeg']])).body;

    const res = await operator.get(item.downloadUrl).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, jpg)).toBe(0);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=.*filename\*=UTF-8''/);
    expect(res.headers['repr-digest']).toBe(`sha-256=:${createHash('sha256').update(jpg).digest('base64')}:`);
    expect(res.headers['cache-control']).toContain('no-store');
    expect((await lastAudit('DOWNLOAD_EVIDENCE'))?.details).toContain(`#${item.id}`);

    // In-browser preview: shown inline and audited as a view, not a download (spec #24)
    const inline = await operator.get(`${item.downloadUrl}?inline=1`);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);
    expect((await lastAudit('VIEW_EVIDENCE'))?.details).toContain(`#${item.id}`);

    // Previews load automatically on every page open: a repeat view isn't logged again, a download always is
    const views = () => prisma.auditLog.count({ where: { action: 'VIEW_EVIDENCE', details: { contains: `#${item.id})` } } });
    const downloads = () => prisma.auditLog.count({ where: { action: 'DOWNLOAD_EVIDENCE', details: { contains: `#${item.id})` } } });
    const [v0, d0] = [await views(), await downloads()];
    expect((await operator.get(`${item.downloadUrl}?inline=1`)).status).toBe(200);
    expect(await views()).toBe(v0);
    expect((await operator.get(item.downloadUrl)).status).toBe(200);
    expect(await downloads()).toBe(d0 + 1);
  });

  it('verifies integrity, and detects a file altered on disk', async () => {
    const id = await draft();
    const [item] = (await operator.upload(ev(id), [[pdf(), 'report.pdf', 'application/pdf']])).body;
    const ok = await operator.post(`${item.downloadUrl}/verify`);
    expect(ok.body).toMatchObject({ intact: true, fileFound: true });

    const row = await prisma.evidence.findUniqueOrThrow({ where: { id: item.id } });
    await writeFile(path.resolve(process.env.EVIDENCE_DIR!, row.storagePath), Buffer.from('%PDF-1.4 tampered'));
    const bad = await operator.post(`${item.downloadUrl}/verify`);
    expect(bad.body).toMatchObject({ intact: false, fileFound: true });
    expect(bad.body.actualSha256).not.toBe(bad.body.expectedSha256);
    expect((await lastAudit('EVIDENCE_INTEGRITY_FAILURE'))?.details).toContain('HASH MISMATCH');
  });

  it('hides evidence on drafts and out-of-scope incidents (404)', async () => {
    const id = await draft();
    const [item] = (await operator.upload(ev(id), [[png(), 'p.png', 'image/png']])).body;
    expect((await sector.get(item.downloadUrl)).status).toBe(404);
    expect((await admin.get(ev(id))).status).toBe(404);

    const outside = await prisma.evidence.findFirst({ where: { incident: { sector: 'Sector-11', status: { not: 'Draft' } } } });
    expect((await sector.get(`/api/v1/incidents/${outside!.incidentId}/evidence/${outside!.id}`)).status).toBe(404);
  });

  it('reports seed placeholders as unavailable instead of failing', async () => {
    const seeded = await prisma.evidence.findFirstOrThrow({ where: { incidentId: 'BIRDS-2026-1001' } });
    const list = await admin.get(ev('BIRDS-2026-1001'));
    expect(list.body[0].available).toBe(false);
    const res = await admin.get(`/api/v1/incidents/BIRDS-2026-1001/evidence/${seeded.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_UNAVAILABLE');
  });
});

describe('removal (soft delete, §19.4)', () => {
  it('lets the creator remove a file while editing; it disappears from lists but stays recorded', async () => {
    const id = await draft();
    const [item] = (await operator.upload(ev(id), [[png(), 'wrong-file.png', 'image/png']])).body;
    expect((await operator.delete(item.downloadUrl)).status).toBe(204);
    expect((await operator.get(ev(id))).body).toHaveLength(0);
    expect((await prisma.evidence.findUniqueOrThrow({ where: { id: item.id } })).deletedAt).not.toBeNull();
    const detail = await operator.get(`/api/v1/incidents/${id}`);
    expect(detail.body.timeline.at(-1)).toMatchObject({ action: 'Evidence removed', notes: 'wrong-file.png' });
  });

  it('after submission only an admin can remove, and must give a reason', async () => {
    const id = await draft();
    const [item] = (await operator.upload(ev(id), [[png(), 'scene.png', 'image/png']])).body;
    await operator.post(`/api/v1/incidents/${id}/submit`);

    expect((await operator.delete(item.downloadUrl)).status).toBe(403);
    expect((await sector.delete(item.downloadUrl)).status).toBe(403);
    expect((await admin.delete(item.downloadUrl)).status).toBe(400);
    expect((await admin.delete(item.downloadUrl, { reason: 'Duplicate of evidence #1' })).status).toBe(204);
    expect((await lastAudit('DELETE_EVIDENCE'))?.details).toContain('Duplicate of evidence #1');
  });
});
