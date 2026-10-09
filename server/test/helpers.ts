import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

export const app = createApp();
export { prisma };

export const DEMO = {
  admin: { username: 'hq_admin', password: 'Admin@123' },
  sector: { username: 'sector_off', password: 'Sector@123' },
  operator: { username: 'batt_op', password: 'Batt@123' },
  verifier: { username: 'verifier', password: 'Verify@123' },
  auditor: { username: 'auditor', password: 'Audit@123' },
} as const;

export type DemoUser = keyof typeof DEMO;

/** Logs in and returns a small client bound to that user's access token. */
export async function as(who: DemoUser) {
  const res = await request(app).post('/api/v1/auth/login').send(DEMO[who]);
  if (res.status !== 200) throw new Error(`login ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token: string = res.body.accessToken;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    token,
    user: res.body.user,
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string, body?: object) => auth(request(app).post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(request(app).patch(url)).send(body ?? {}),
    delete: (url: string, body?: object) => auth(request(app).delete(url)).send(body ?? {}),
    /** multipart upload: files = [[buffer, filename, contentType]] */
    upload: (url: string, files: [Buffer, string, string][]) =>
      files.reduce((r, [buf, filename, contentType]) => r.attach('files', buf, { filename, contentType }), auth(request(app).post(url))),
  };
}

/** A valid incident payload inside batt_op's scope (17 BGB). */
export const newIncident = (overrides: Record<string, unknown> = {}) => ({
  title: 'Test crossing near pillar 12',
  category: 'Illegal Crossing',
  subcategory: 'Entry without documents',
  severity: 'Medium',
  date: '2026-10-01',
  time: '02:30',
  location: 'Pillar 12 riverbank',
  sector: 'Sector-7',
  battalion: '17 BGB',
  bop: 'BOP Teknaf',
  lat: 20.87,
  lng: 92.27,
  description: 'Patrol observed two individuals crossing at night without documents.',
  ...overrides,
});

export async function lastAudit(action?: string) {
  return prisma.auditLog.findFirst({ where: action ? { action } : {}, orderBy: { seq: 'desc' } });
}
