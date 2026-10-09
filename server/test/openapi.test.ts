import SwaggerParser from '@apidevtools/swagger-parser';
import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadOpenApi, OPENAPI_PATH } from '../src/apiDocs.js';
import { adminRouter } from '../src/modules/admin/admin.router.js';
import { auditRouter } from '../src/modules/audit/audit.router.js';
import { authRouter } from '../src/modules/auth/auth.router.js';
import { evidenceRouter } from '../src/modules/evidence/evidence.router.js';
import { gisRouter } from '../src/modules/gis/gis.router.js';
import { incidentsRouter } from '../src/modules/incidents/incidents.router.js';
import { notificationsRouter } from '../src/modules/notifications/notifications.router.js';
import { reportsRouter } from '../src/modules/reports/reports.router.js';
import { usersRouter } from '../src/modules/users/users.router.js';
import { app } from './helpers.js';

// Specs #31, #52 — docs/api/openapi.yaml must be valid OpenAPI 3.1 and describe exactly the routes
// the server has. Mount points mirror src/app.ts.

const MOUNTS: [string, Router][] = [
  ['/auth', authRouter],
  ['/incidents/:id/evidence', evidenceRouter],
  ['/incidents', incidentsRouter],
  ['/gis', gisRouter],
  ['/users', usersRouter],
  ['/admin', adminRouter],
  ['/audit', auditRouter],
  ['/notifications', notificationsRouter],
  ['/reports', reportsRouter],
];

// "GET /incidents/{id}" for every route the routers define, plus the health probe in app.ts
function serverRoutes() {
  const routes = new Set(['GET /health']);
  for (const [mount, router] of MOUNTS) {
    for (const layer of router.stack) {
      const route = layer.route as { path: string; methods: Record<string, boolean> } | undefined;
      if (!route) continue;
      const full = (mount + (route.path === '/' ? '' : route.path)).replace(/:(\w+)/g, '{$1}');
      for (const method of Object.keys(route.methods)) routes.add(`${method.toUpperCase()} ${full}`);
    }
  }
  return routes;
}

function documentedRoutes() {
  const spec = loadOpenApi() as { paths: Record<string, Record<string, unknown>> };
  const routes = new Set<string>();
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
      if (item[method]) routes.add(`${method.toUpperCase()} ${p}`);
    }
  }
  return routes;
}

describe('OpenAPI document (specs #31, #52)', () => {
  it('is valid OpenAPI 3.1', async () => {
    const api = (await SwaggerParser.validate(OPENAPI_PATH)) as { openapi?: string };
    expect(api.openapi).toBe('3.1.0');
  });

  it('documents every server route and nothing else', () => {
    const server = serverRoutes();
    const docs = documentedRoutes();
    expect([...server].filter((r) => !docs.has(r)), 'routes missing from openapi.yaml').toEqual([]);
    expect([...docs].filter((r) => !server.has(r)), 'documented routes the server lacks').toEqual([]);
  });

  it('is served as JSON without signing in, with Swagger UI at /api/docs', async () => {
    const json = await request(app).get('/api/v1/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.1.0');
    expect(json.body.paths['/incidents']).toBeDefined();

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });
});
