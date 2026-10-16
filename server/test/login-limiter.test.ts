import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { failedAttemptLimiter } from '../src/middleware/rateLimiter.js';

// Spec #49 / DOUBT-007 — the sign-in limiter counts failed attempts only. Regression for the load-test
// finding of 15-10-2026: simultaneous correct sign-ins from one address must never be refused.

function app(limit = 3) {
  const a = express();
  a.use(express.json());
  // Stands in for /auth/login: password "ok" succeeds after a delay like bcrypt; anything else is 401
  a.post('/login', failedAttemptLimiter({ windowMs: 60_000, limit, message: 'Too many', skip: () => false }), async (req, res) => {
    await new Promise((r) => setTimeout(r, 150));
    res.status(req.body.password === 'ok' ? 200 : 401).json({});
  });
  return a;
}

describe('failed sign-in limiter', () => {
  it('lets many simultaneous correct sign-ins from one address through', async () => {
    const a = app(3);
    const statuses = await Promise.all(Array.from({ length: 20 }, () => request(a).post('/login').send({ password: 'ok' }).then((r) => r.status)));
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect((await request(a).post('/login').send({ password: 'ok' })).status).toBe(200);
  });

  it('blocks the address after the limit of failed attempts, with Retry-After', async () => {
    const a = app(3);
    for (let i = 0; i < 3; i++) expect((await request(a).post('/login').send({ password: 'wrong' })).status).toBe(401);
    const blocked = await request(a).post('/login').send({ password: 'ok' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not count its own refusals or successful sign-ins', async () => {
    const a = app(3);
    for (let i = 0; i < 2; i++) await request(a).post('/login').send({ password: 'wrong' });
    for (let i = 0; i < 5; i++) expect((await request(a).post('/login').send({ password: 'ok' })).status).toBe(200);
    expect((await request(a).post('/login').send({ password: 'wrong' })).status).toBe(401);
    expect((await request(a).post('/login').send({ password: 'ok' })).status).toBe(429);
  });
});
