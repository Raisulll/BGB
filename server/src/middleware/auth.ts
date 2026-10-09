import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { getSecurityConfig } from '../modules/admin/config.service.js';
import { writeAudit } from '../modules/audit/audit.service.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { AppError, unauthorized } from '../utils/errors.js';
import { isBackgroundRequest, requestContext } from '../utils/requestContext.js';

// Throttle for last_seen_at writes: at most one per session per minute.
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Spec #4, #28 — verifies the RS256 access token AND checks the backing session row on every
 * request, so logout, single-session enforcement, deactivation and idle timeout take effect
 * immediately instead of when the 15-minute token expires.
 */
async function authenticate(req: Request, allowPendingPasswordChange: boolean) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const { user, sessionId } = await authenticateToken(header.slice(7), {
    allowPendingPasswordChange,
    touch: !isBackgroundRequest(req),
    ctx: requestContext(req),
  });
  req.user = user;
  req.sessionId = sessionId;
}

/**
 * The checks behind requireAuth, also used by the realtime channel: token signature, live session,
 * active user, idle timeout. `touch: false` (realtime, background polling) never counts as activity.
 */
export async function authenticateToken(
  token: string,
  { allowPendingPasswordChange = false, touch = false, ctx }: { allowPendingPasswordChange?: boolean; touch?: boolean; ctx: ReturnType<typeof requestContext> },
): Promise<{ user: Express.AuthUser; sessionId: string }> {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired access token', 'TOKEN_INVALID');
  }

  const session = await prisma.refreshToken.findUnique({ where: { id: payload.sid }, include: { user: true } });
  const now = Date.now();
  if (!session || session.userId !== payload.sub || session.revoked || session.expiresAt.getTime() <= now || !session.user.isActive) {
    throw unauthorized('Session has ended', 'SESSION_ENDED');
  }

  const { sessionTimeoutMinutes } = await getSecurityConfig();
  if (now - session.lastSeenAt.getTime() > sessionTimeoutMinutes * 60_000) {
    await prisma.refreshToken.update({ where: { id: session.id }, data: { revoked: true, revokedReason: 'idle_timeout' } });
    await writeAudit({
      action: 'SESSION_TIMEOUT',
      username: session.user.username,
      userId: session.user.id,
      details: `Session ended after ${sessionTimeoutMinutes} min of inactivity`,
      ctx,
    });
    throw unauthorized('Session expired due to inactivity', 'SESSION_EXPIRED');
  }
  if (touch && now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.refreshToken.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }

  const u = session.user;
  if (u.mustChangePassword && !allowPendingPasswordChange) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your password before continuing');
  }

  return {
    user: {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role, // always the current DB role, not the one baked into the token
      scope: u.scope,
      email: u.email,
      mustChangePassword: u.mustChangePassword,
    },
    sessionId: session.id,
  };
}

/** Standard guard for all protected routes. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  authenticate(req, false).then(() => next(), next);
}

/** For /auth/me, /auth/logout and /auth/change-password: usable while a password change is pending. */
export function requireAuthAllowPasswordChange(req: Request, _res: Response, next: NextFunction) {
  authenticate(req, true).then(() => next(), next);
}
