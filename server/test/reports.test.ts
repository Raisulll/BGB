import request from 'supertest';
import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, as, newIncident, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, operator: Client, auditor: Client;

beforeAll(async () => {
  admin = await as('admin');
  operator = await as('operator');
  auditor = await as('auditor');
});
afterAll(() => prisma.$disconnect());

const filed = { status: { not: 'Draft' } };
const R = '/api/v1/reports';

describe('KPIs and breakdowns (specs #17, #19)', () => {
  it('summary matches the database and excludes drafts', async () => {
    const res = await admin.get(`${R}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(await prisma.incident.count({ where: filed }));
    const statusSum = Object.values(res.body.byStatus as Record<string, number>).reduce((a, b) => a + b, 0);
    const severitySum = Object.values(res.body.bySeverity as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(statusSum).toBe(res.body.total);
    expect(severitySum).toBe(res.body.total);
    expect(res.body.pendingReview).toBe(await prisma.incident.count({ where: { status: { in: ['Submitted', 'Reviewed', 'Verified'] } } }));

    await operator.post('/api/v1/incidents', newIncident()); // a draft
    expect((await admin.get(`${R}/summary`)).body.total).toBe(res.body.total);
  });

  it('is scoped: a battalion operator gets their battalion\'s figures (via the dashboard permission)', async () => {
    const res = await operator.get(`${R}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(await prisma.incident.count({ where: { ...filed, battalion: '17 BGB' } }));
  });

  it('by-category lists every active category (zeros included) and adds up', async () => {
    const res = await admin.get(`${R}/by-category`);
    const total = (await admin.get(`${R}/summary`)).body.total;
    expect(res.body.map((c: { category: string }) => c.category)).toEqual(expect.arrayContaining(['Smuggling', 'Human Trafficking', 'Other']));
    expect(res.body.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBe(total);
  });

  it('by-sector gives a severity-weighted risk score', async () => {
    const res = await admin.get(`${R}/by-sector`);
    const s7 = res.body.find((s: { sector: string }) => s.sector === 'Sector-7');
    const rows = await prisma.incident.groupBy({ by: ['severity'], where: { ...filed, sector: 'Sector-7' }, _count: { _all: true } });
    const weight: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
    expect(s7.riskScore).toBe(rows.reduce((n, r) => n + r._count._all * weight[r.severity]!, 0));
    expect(res.body[0].riskScore).toBeGreaterThanOrEqual(res.body.at(-1).riskScore);
  });

  it('by-severity always returns all four levels', async () => {
    const res = await operator.get(`${R}/by-severity?category=Human Trafficking`);
    expect(res.body.map((s: { severity: string }) => s.severity)).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });
});

describe('trends (spec #20)', () => {
  it('day buckets cover the range with no gaps and match the database', async () => {
    const res = await admin.get(`${R}/trends?granularity=day&dateFrom=2026-10-01&dateTo=2026-10-31`);
    expect(res.body.series).toHaveLength(31);
    expect(res.body.series[0]).toMatchObject({ period: '2026-10-01', start: '2026-10-01' });
    const sum = res.body.series.reduce((n: number, b: { count: number }) => n + b.count, 0);
    const expected = await prisma.incident.count({
      where: { ...filed, incidentDate: { gte: new Date('2026-10-01T00:00:00Z'), lte: new Date('2026-10-31T00:00:00Z') } },
    });
    expect(sum).toBe(expected);
  });

  it('labels weeks, quarters and years; defaults to 12 months', async () => {
    const week = await admin.get(`${R}/trends?granularity=week&dateFrom=2026-10-05&dateTo=2026-10-18`);
    expect(week.body.series.map((b: { period: string }) => b.period)).toEqual(['2026-W41', '2026-W42']);
    const quarter = await admin.get(`${R}/trends?granularity=quarter&dateFrom=2026-01-01&dateTo=2026-12-31`);
    expect(quarter.body.series.map((b: { period: string }) => b.period)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    const year = await admin.get(`${R}/trends?granularity=year&dateFrom=2025-01-01&dateTo=2026-12-31`);
    expect(year.body.series.map((b: { period: string }) => b.period)).toEqual(['2025', '2026']);
    expect((await admin.get(`${R}/trends`)).body.series).toHaveLength(12);
  });

  it('rejects ranges that are inverted or too fine-grained', async () => {
    expect((await admin.get(`${R}/trends?dateFrom=2026-10-31&dateTo=2026-10-01`)).status).toBe(400);
    expect((await admin.get(`${R}/trends?granularity=day&dateFrom=2000-01-01&dateTo=2026-01-01`)).status).toBe(400);
    expect((await admin.get(`${R}/trends?granularity=hourly`)).status).toBe(400);
  });
});

describe('configurable reports and exports (specs #21, #22)', () => {
  it('high-threat digest contains only High and Critical incidents', async () => {
    const res = await admin.get(`${R}/operational?type=high-threat`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ type: 'high-threat', classification: 'CONFIDENTIAL // OPERATIONAL' });
    expect(res.body.incidents.length).toBeGreaterThan(0);
    expect(res.body.incidents.every((i: { severity: string }) => ['High', 'Critical'].includes(i.severity))).toBe(true);
    expect(res.body.summary.total).toBe(res.body.incidents.length);
  });

  it('requires the reports permission', async () => {
    expect((await operator.get(`${R}/operational`)).status).toBe(403);
    expect((await operator.get(`${R}/export/csv`)).status).toBe(403);
    expect((await auditor.get(`${R}/operational`)).status).toBe(200);
  });

  it('exports filtered incidents to XLSX with DD-MM-YYYY dates (also at /incidents/export)', async () => {
    const res = await request(app)
      .get('/api/v1/incidents/export/excel?sector=Sector-11')
      .set('Authorization', `Bearer ${admin.token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(XLSX.read(res.body as Buffer).Sheets.Incidents!, { header: 1 });
    expect(rows[0]![0]).toBe('CONFIDENTIAL // OPERATIONAL');
    expect(rows[4]![0]).toBe('Reference No.');
    const data = rows.slice(5);
    expect(data.length).toBe(await prisma.incident.count({ where: { ...filed, sector: 'Sector-11' } }));
    expect(data.every((r) => r[11] === 'Sector-11' && /^\d{2}-\d{2}-\d{4}$/.test(String(r[6])))).toBe(true);
  });

  it('CSV export is audited', async () => {
    const res = await admin.get(`${R}/export/csv?type=statistical&severity=Critical`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[1]).toBe('BIRDS STATISTICAL & THREAT SUMMARY — Border Guard Bangladesh');
    const entry = await prisma.auditLog.findFirst({ where: { action: 'EXPORT_REPORT' }, orderBy: { seq: 'desc' } });
    expect(entry?.details).toMatch(/^CSV export of statistical report/);
  });
});
