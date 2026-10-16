import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

// Spec #49 — §20 limits. In-memory store: per process. With PM2 cluster mode the effective limit
// is per worker; move to a shared store (e.g. Redis) if strict global limits are required.
const message = (msg: string) => ({ error: { code: 'RATE_LIMITED', message: msg } });
// The automated test suite logs in many times from one address
const skip = () => env.NODE_ENV === 'test';

/**
 * Counts only requests that have FAILED, after their answer is known (`res` finish), and never its
 * own 429 refusals. express-rate-limit's skipSuccessfulRequests counts a request when it arrives and
 * removes it only when it succeeds, so with password hashing taking ~0.3 s, more than `limit`
 * simultaneous correct sign-ins from one address (a unit behind one NAT gateway at the start of a
 * shift) were refused, and those refusals then locked the address out for the whole window
 * (found by the load test, 15-10-2026).
 */
export function failedAttemptLimiter(opts: { windowMs: number; limit: number; message: string; skip?: () => boolean }) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
  }, opts.windowMs);
  sweep.unref();
  return (req: Request, res: Response, next: NextFunction) => {
    if ((opts.skip ?? skip)()) return next();
    const key = ipKeyGenerator(req.ip ?? '');
    const now = Date.now();
    const entry = failures.get(key);
    if (entry && entry.resetAt > now && entry.count >= opts.limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json(message(opts.message));
      return;
    }
    res.on('finish', () => {
      if (res.statusCode < 400 || res.statusCode === 429 || res.statusCode >= 500) return;
      const at = Date.now();
      const cur = failures.get(key);
      if (!cur || cur.resetAt <= at) failures.set(key, { count: 1, resetAt: at + opts.windowMs });
      else cur.count += 1;
    });
    next();
  };
}

/**
 * 10 failed login attempts per IP per 15 minutes. Successful logins are not counted, so many
 * users behind one office NAT address don't lock each other out (see DOUBT-007). In-memory, per
 * process, like the other limiters. The per-account lockout (5 failures) applies as well.
 */
export const loginLimiter = failedAttemptLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
  message: 'Too many login attempts from this address. Try again later.',
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

/** API_RATE_LIMIT_PER_MINUTE (default 100) requests per minute per authenticated user (falls back to IP). Mount after requireAuth. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.API_RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? '')),
  message: message('Too many requests. Slow down and try again shortly.'),
});
