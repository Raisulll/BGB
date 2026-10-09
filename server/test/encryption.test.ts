import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, lastAudit, newIncident, prisma } from './helpers.js';
import { pdf } from './fixtures.js';

// Spec #27 — evidence encrypted at rest (AES-256-GCM). vitest.config.ts sets a test key.

type Client = Awaited<ReturnType<typeof as>>;
let operator: Client;
const MAGIC = Buffer.from('BIRDSEV1');
const filePath = (storagePath: string) => path.resolve(process.env.EVIDENCE_DIR!, storagePath);

beforeAll(async () => {
  operator = await as('operator');
});
afterAll(() => prisma.$disconnect());

async function uploadPdf(content = pdf()) {
  const inc = await operator.post('/api/v1/incidents', newIncident());
  const res = await operator.upload(`/api/v1/incidents/${inc.body.id}/evidence`, [[content, 'statement.pdf', 'application/pdf']]);
  expect(res.status).toBe(201);
  const item = res.body[0];
  const row = await prisma.evidence.findUniqueOrThrow({ where: { id: item.id } });
  return { item, row };
}

const binary = (r: ReturnType<Client['get']>) =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('evidence encryption at rest (spec #27)', () => {
  it('stores ciphertext on disk and serves the original bytes', async () => {
    const original = pdf();
    const { item, row } = await uploadPdf(original);
    const onDisk = await readFile(filePath(row.storagePath));
    expect(onDisk.subarray(0, MAGIC.length).equals(MAGIC)).toBe(true);
    expect(onDisk.includes(Buffer.from('%PDF'))).toBe(false);

    const res = await binary(operator.get(item.downloadUrl));
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, original)).toBe(0);
    expect((await operator.post(`${item.downloadUrl}/verify`)).body).toMatchObject({ intact: true });
  });

  it('refuses a ciphertext altered on disk (download 409, verify fails, audited)', async () => {
    const { item, row } = await uploadPdf();
    const onDisk = await readFile(filePath(row.storagePath));
    onDisk[onDisk.length - 1] = onDisk.at(-1)! ^ 0xff; // flip the last byte of the ciphertext
    await writeFile(filePath(row.storagePath), onDisk);

    const dl = await operator.get(item.downloadUrl);
    expect(dl.status).toBe(409);
    expect(dl.body.error.code).toBe('EVIDENCE_TAMPERED');
    const v = await operator.post(`${item.downloadUrl}/verify`);
    expect(v.body).toMatchObject({ intact: false, fileFound: true });
    expect((await lastAudit('EVIDENCE_INTEGRITY_FAILURE'))?.details).toContain('DECRYPTION FAILED');
  });

  it('refuses a plaintext file swapped in place of an encrypted one', async () => {
    const { item, row } = await uploadPdf();
    await writeFile(filePath(row.storagePath), Buffer.from('%PDF-1.4 forged statement'));
    expect((await operator.get(item.downloadUrl)).status).toBe(409);
  });

  it('binds each file to its record: a ciphertext copied onto another record fails', async () => {
    const a = await uploadPdf();
    const b = await uploadPdf();
    await writeFile(filePath(b.row.storagePath), await readFile(filePath(a.row.storagePath)));
    expect((await operator.get(b.item.downloadUrl)).status).toBe(409);
  });

  it('still serves an intact file stored before encryption was enabled', async () => {
    const original = pdf();
    const { item, row } = await uploadPdf(original);
    await writeFile(filePath(row.storagePath), original); // as a pre-encryption upload would be stored
    const res = await binary(operator.get(item.downloadUrl));
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, original)).toBe(0);
  });
});
