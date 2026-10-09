import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, as, lastAudit, newIncident, prisma } from './helpers.js';

type Client = Awaited<ReturnType<typeof as>>;
let admin: Client, operator: Client;

beforeAll(async () => {
  admin = await as('admin');
  operator = await as('operator');
});
afterAll(async () => {
  await admin.patch('/api/v1/admin/config', { values: { 'password.max_attempts': 5 } });
  await admin.post('/api/v1/admin/roles/permissions/reset');
  await prisma.$disconnect();
});

const login = (username: string, password: string) => request(app).post('/api/v1/auth/login').send({ username, password });

describe('system configuration (spec #47)', () => {
  it('returns typed settings and marks incident counters read-only', async () => {
    const res = await admin.get('/api/v1/admin/config');
    const byKey = Object.fromEntries(res.body.map((r: { key: string }) => [r.key, r]));
    expect(byKey['password.min_length']).toMatchObject({ value: 8, type: 'int', editable: true });
    expect(byKey['session.single_session']).toMatchObject({ value: true, type: 'bool' });
    expect(byKey['incident.next_id.2026'].editable).toBe(false);
  });

  it('validates every value and rejects the whole update if one is wrong', async () => {
    const res = await admin.patch('/api/v1/admin/config', {
      values: { 'password.min_length': 4, 'session.timeout_minutes': 'soon', 'incident.next_id.2026': 1, 'password.max_attempts': 3 },
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(['incident.next_id.2026', 'password.min_length', 'session.timeout_minutes']);
    const unchanged = await prisma.systemConfig.findUniqueOrThrow({ where: { key: 'password.max_attempts' } });
    expect(unchanged.value).toBe('5');
  });

  it('applies changes immediately and audits old → new', async () => {
    const res = await admin.patch('/api/v1/admin/config', { values: { 'password.max_attempts': 3 } });
    expect(res.status).toBe(200);
    expect((await lastAudit('CONFIG_CHANGE'))?.details).toBe('password.max_attempts: 5 → 3');

    for (let i = 0; i < 2; i++) expect((await login('verifier', 'wrong')).status).toBe(401);
    expect((await login('verifier', 'wrong')).status).toBe(423); // third failure now locks
    await admin.patch('/api/v1/users/U004', { unlock: true });
  });
});

describe('role permissions (spec #3)', () => {
  it('takes effect immediately when a page is removed from a role', async () => {
    expect((await operator.get('/api/v1/gis/incidents')).status).toBe(200);
    const res = await admin.patch('/api/v1/admin/roles/permissions', { role: 'Battalion Operator', pageId: 'map', enabled: false });
    expect(res.body.permissions['Battalion Operator']).not.toContain('map');
    expect((await operator.get('/api/v1/gis/incidents')).status).toBe(403);
    expect((await lastAudit('PERMISSION_CHANGE'))?.details).toBe('Battalion Operator: -map');
  });

  it('refuses to lock HQ Administrators out of the admin module', async () => {
    const res = await admin.patch('/api/v1/admin/roles/permissions', { role: 'HQ Administrator', permissions: ['dashboard'] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ADMIN_LOCKOUT');
  });

  it('resets to factory defaults', async () => {
    const res = await admin.post('/api/v1/admin/roles/permissions/reset');
    expect(res.body.permissions['Battalion Operator']).toEqual(['dashboard', 'incidents', 'create', 'map', 'messages']);
    expect((await operator.get('/api/v1/gis/incidents')).status).toBe(200);
  });
});

describe('incident categories (spec #6)', () => {
  it('creates a category that the incident form can use straight away', async () => {
    const res = await admin.post('/api/v1/admin/categories', { name: 'Cyber Incident', subcategories: ['Signal jamming', 'Network intrusion'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'CAT08', name: 'Cyber Incident', isActive: true });
    const inc = await operator.post('/api/v1/incidents', newIncident({ category: 'Cyber Incident', subcategory: 'Signal jamming' }));
    expect(inc.status).toBe(201);
    expect((await admin.post('/api/v1/admin/categories', { name: 'cyber incident' })).status).toBe(409);
  });

  it('deactivated categories and subcategories can no longer be chosen', async () => {
    await admin.patch('/api/v1/admin/categories/CAT08', { subcategoryStatus: [{ name: 'Signal jamming', isActive: false }] });
    expect((await operator.post('/api/v1/incidents', newIncident({ category: 'Cyber Incident', subcategory: 'Signal jamming' }))).status).toBe(400);
    await admin.patch('/api/v1/admin/categories/CAT08', { isActive: false });
    expect((await operator.post('/api/v1/incidents', newIncident({ category: 'Cyber Incident', subcategory: null }))).status).toBe(400);
    expect((await lastAudit('CATEGORY_UPDATE'))?.details).toBe('CAT08: deactivated');
  });

  it('won\'t rename a category that existing incidents use', async () => {
    const res = await admin.patch('/api/v1/admin/categories/CAT01', { name: 'Contraband' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_IN_USE');
    const smuggling = (await admin.get('/api/v1/admin/categories')).body.find((c: { id: string }) => c.id === 'CAT01');
    expect(smuggling.incidentCount).toBeGreaterThan(0);
  });
});

describe('organizational hierarchy (spec #9)', () => {
  it('adds a BOP that operators in that battalion can file under', async () => {
    const res = await admin.post('/api/v1/admin/org-hierarchy', { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Shah Porir Dwip' });
    expect(res.status).toBe(201);
    expect(res.body.hierarchy['Sector-7']['17 BGB'].BOPs).toContain('BOP Shah Porir Dwip');
    const inc = await operator.post('/api/v1/incidents', newIncident({ bop: 'BOP Shah Porir Dwip' }));
    expect(inc.status).toBe(201);
    expect((await lastAudit('ORG_UNIT_CREATE'))?.details).toBe('Sector-7 / 17 BGB / BOP Shah Porir Dwip');
  });

  it('keeps the tree consistent: no duplicates, no battalion in two sectors, no ambiguous names', async () => {
    expect((await admin.post('/api/v1/admin/org-hierarchy', { sector: 'Sector-7', battalion: '17 BGB', bop: 'BOP Teknaf' })).status).toBe(409);
    expect((await admin.post('/api/v1/admin/org-hierarchy', { sector: 'Sector-11', battalion: '17 BGB', bop: 'BOP New' })).body.error.code).toBe('HIERARCHY_CONFLICT');
    expect((await admin.post('/api/v1/admin/org-hierarchy', { sector: 'Sector-11', battalion: '8 BGB', bop: 'Sector-7' })).body.error.code).toBe('HIERARCHY_CONFLICT');
  });
});
