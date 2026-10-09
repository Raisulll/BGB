import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

// Spec #2 / #56 — the API process serving the built SPA (SERVE_SPA_DIR, single-service demo hosting).

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'birds-spa-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(dir, 'bgb.png'), 'png');
  env.SERVE_SPA_DIR = dir;
  app = createApp();
});

afterAll(() => {
  env.SERVE_SPA_DIR = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe('SPA serving (SERVE_SPA_DIR)', () => {
  it('serves index.html for client-side routes, uncached, with the SPA CSP', async () => {
    for (const url of ['/', '/incidents/BIRDS-2026-1021', '/admin']) {
      const res = await request(app).get(url).set('Accept', 'text/html');
      expect(res.status).toBe(200);
      expect(res.text).toContain('id="root"');
      expect(res.headers['cache-control']).toBe('no-cache');
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain('https://*.tile.openstreetmap.org');
      expect(csp).toContain('https://fonts.gstatic.com');
    }
  });

  it('serves hashed assets with a long immutable cache and other files uncached', async () => {
    const asset = await request(app).get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const crest = await request(app).get('/bgb.png');
    expect(crest.status).toBe(200);
    expect(crest.headers['cache-control']).toBe('no-cache');
  });

  it('keeps API and missing files as JSON 404s, never index.html', async () => {
    for (const url of ['/api/v1/nope', '/api', '/assets/missing.js', '/missing.png']) {
      const res = await request(app).get(url).set('Accept', 'text/html');
      expect(res.status, url).toBe(404);
      expect(res.body.error?.code, url).toBeDefined();
    }
  });

  it('does not answer non-GET requests with the SPA', async () => {
    const res = await request(app).post('/incidents');
    expect(res.status).toBe(404);
  });
});
