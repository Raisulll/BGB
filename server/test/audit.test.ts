import request from 'supertest';
import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, as, lastAudit, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let auditor: Client, operator: Client;

beforeAll(async () => {
  auditor = await as('auditor');
  operator = await as('operator');
});
afterAll(() => prisma.$disconnect());

const binary = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('audit trail API (spec #24)', () => {
  it('is restricted to the audit permission', async () => {
    expect((await operator.get('/api/v1/audit')).status).toBe(403);
  });

  it('lists newest first with hashes, and logs the visit itself', async () => {
    const res = await auditor.get('/api/v1/audit?pageSize=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    const seqs = res.body.data.map((a: { seq: number }) => a.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(res.body.data[0].rowHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.actions).toContain('LOGIN');
    expect((await lastAudit())?.action).toBe('VIEW_AUDIT_LOG');
  });

  it('filters by action, user and Bangladesh calendar day', async () => {
    const logins = await auditor.get('/api/v1/audit?action=LOGIN&pageSize=100&page=2');
    expect(logins.body.data.every((a: { action: string }) => a.action === 'LOGIN')).toBe(true);

    const byUser = await auditor.get('/api/v1/audit?username=hq_admin&pageSize=100&page=2');
    expect(byUser.body.data.every((a: { username: string }) => a.username === 'hq_admin')).toBe(true);

    // All 15 seeded entries are dated 06-10-2026 (BST)
    const seeded = await auditor.get('/api/v1/audit?dateFrom=2026-10-06&dateTo=2026-10-06&pageSize=100&page=2');
    expect(seeded.body.total).toBe(15);
  });

  it('verifies the hash chain on demand', async () => {
    const res = await auditor.get('/api/v1/audit/verify');
    expect(res.body).toMatchObject({ intact: true, firstBrokenSeq: null });
    expect(res.body.rowsChecked).toBeGreaterThan(15);
    expect((await lastAudit())?.action).toBe('VERIFY_AUDIT_CHAIN');
  });

  it('exports CSV with the classification banner, BOM, BST times and formula-injection protection', async () => {
    // An attacker-controlled value that a spreadsheet would execute as a formula
    await request(app).post('/api/v1/auth/login').send({ username: "=HYPERLINK(\"http://x\")", password: 'x' });

    const res = await binary(auditor.get('/api/v1/audit/export/csv?action=LOGIN_FAILED'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/BIRDS_Audit_Trail_\d{4}-\d{2}-\d{2}\.csv/);
    const text = (res.body as Buffer).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe('CONFIDENTIAL // OPERATIONAL');
    expect(lines[4]).toBe('Seq,Timestamp (BST),User,Action,Details,IP Address,Row Hash (SHA-256)');
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).not.toMatch(/,=HYPERLINK/);
    expect(lines[5]).toMatch(/^\d+,\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2},/);
    expect((await lastAudit())?.action).toBe('EXPORT_AUDIT_LOG');
  });

  it('exports a real XLSX workbook', async () => {
    const res = await binary(auditor.get('/api/v1/audit/export/excel?action=LOGIN'));
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const book = XLSX.read(res.body as Buffer);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['Audit Trail']!, { header: 1 });
    expect(rows[0]![0]).toBe('CONFIDENTIAL // OPERATIONAL');
    expect(rows[4]).toContain('Action');
    expect(rows.slice(5).every((r) => r[3] === 'LOGIN')).toBe(true);
    expect((await auditor.get('/api/v1/audit/export/pdf')).status).toBe(404);
  });
});
