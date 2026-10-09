import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

// Spec #49 — §20 limits. In-memory store: per process. With PM2 cluster mode the effective limit
// is per worker; move to a shared store (e.g. Redis) if strict global limits are required.
const message = (msg: string) => ({ error: { code: 'RATE_LIMITED', message: msg } });
// The automated test suite logs in many times from one address
const skip = () => env.NODE_ENV === 'test';

/**
 * 10 failed login attempts per IP per 15 minutes. Successful logins are not counted, so many
 * users behind one office NAT address don't lock each other out (see DOUBT-007).
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: message('Too many login attempts from this address. Try again later.'),
});

/** Token refresh: every open tab refreshes about every 15 minutes, so this is far looser than login. */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: message('Too many session refresh requests. Try again later.'),
});

/** 100 requests per minute per authenticated user (falls back to IP). Mount after requireAuth. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? '')),
  message: message('Too many requests. Slow down and try again shortly.'),
});
