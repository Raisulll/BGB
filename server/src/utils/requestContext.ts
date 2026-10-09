import { isIP } from 'node:net';
import type { Request } from 'express';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

// req.ip honours TRUST_PROXY, so behind Nginx it is the real client address.
// IPv4-mapped IPv6 (::ffff:10.0.0.1) is unwrapped so the INET column stores the plain IPv4 address.
export function requestContext(req: Request): RequestContext {
  let ip = req.ip ?? null;
  if (ip?.startsWith('::ffff:')) ip = ip.slice(7);
  return {
    ip: ip && isIP(ip) ? ip : null,
    userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
  };
}

/**
 * Spec #28 — the SPA marks polling it does on its own (e.g. notifications while the user is away)
 * with this header. Such requests must not count as user activity, or an unattended open tab
 * would never reach the idle timeout.
 */
export const isBackgroundRequest = (req: Request) => req.get('x-background-request') === '1';
