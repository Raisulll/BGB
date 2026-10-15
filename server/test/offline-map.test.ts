import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

// Specs #8, #18 — offline map file (MAP_DIR/bangladesh.pmtiles) served by the API itself.

let dir: string;
const original = env.MAP_DIR;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'birds-map-'));
});
afterAll(() => {
  env.MAP_DIR = original;
  rmSync(dir, { recursive: true, force: true });
});

describe('offline map (MAP_DIR)', () => {
  it('serves byte ranges of the map file without signing in', async () => {
    writeFileSync(path.join(dir, 'bangladesh.pmtiles'), Buffer.from('PMTiles' + 'x'.repeat(1000)));
    env.MAP_DIR = dir;
    const app = createApp();
    const head = await request(app).head('/api/v1/map/bangladesh.pmtiles');
    expect(head.status).toBe(200);
    expect(head.headers['accept-ranges']).toBe('bytes');
    const part = await request(app).get('/api/v1/map/bangladesh.pmtiles').set('Range', 'bytes=0-6');
    expect(part.status).toBe(206);
    expect(Buffer.from(part.body).toString()).toBe('PMTiles');
  });

  it('answers 404 when there is no map file, so the app uses the online tiles', async () => {
    env.MAP_DIR = path.join(dir, 'missing');
    const res = await request(createApp()).head('/api/v1/map/bangladesh.pmtiles');
    expect(res.status).toBe(404);
  });

  it('serves nothing else from the folder', async () => {
    writeFileSync(path.join(dir, '.env'), 'SECRET=1');
    env.MAP_DIR = dir;
    const res = await request(createApp()).get('/api/v1/map/.env');
    expect(res.status).toBe(404);
  });
});
