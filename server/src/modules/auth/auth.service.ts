import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { prisma } from '../../db.js';
import type { User } from '../../generated/prisma/client.js';
import { permissionsFor } from '../../middleware/rbac.js';
import { AppError, badRequest, locked, notFound, unauthorized } from '../../utils/errors.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { getSecurityConfig, validatePassword } from '../admin/config.service.js';
import { writeAudit } from '../audit/audit.service.js';
import { ACCESS_TOKEN_TTL_SEC, hashToken, newRefreshToken, signAccessToken } from './tokens.js';

const INVALID_CREDENTIALS = 'Invalid username or password';
// A refresh token presented again within this window after rotation is treated as a benign
// race (two tabs refreshing at once), not as theft.
const ROTATION_GRACE_MS = 10_000;

// Compared against when the username does not exist, so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('birds-timing-equaliser', env.BCRYPT_ROUNDS);

export const hashPassword = (pwd: string) => bcrypt.hash(pwd, env.BCRYPT_ROUNDS);

export async function toUserDto(u: User) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    scope: u.scope,
    email: u.email,
    mustChangePassword: u.mustChangePassword,
    permissions: await permissionsFor(u.role),
  };
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueSession(user: User, ctx: RequestContext, singleSession: boolean): Promise<IssuedSession> {
  const refreshToken = newRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_HOURS * 3_600_000);

  const session = await prisma.$transaction(async (tx) => {
    // Spec #28 concurrent-session control: a new login ends the user's other sessions
    if (singleSession) {
      await tx.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true, revokedReason: 'superseded' } });
    }
    return tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  });

  return {
    accessToken: signAccessToken({ sub: user.id, sid: session.id, role: user.role }),
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    refreshToken,
    refreshExpiresAt,
  };
}

// ---------------------------------------------------------------------------
// Login (specs #4, #28, #29)
// ---------------------------------------------------------------------------
export async function login(username: string, password: string, ctx: RequestContext) {
  const policy = await getSecurityConfig();
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    await writeAudit({ action: 'LOGIN_FAILED', username, details: 'Unknown username', ctx });
    throw unauthorized(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    await writeAudit({ action: 'LOGIN_BLOCKED', username, userId: user.id, details: 'Login attempt on locked account', ctx });
    throw locked(`Account locked. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk || !user.isActive) {
    if (!user.isActive) {
      await writeAudit({ action: 'LOGIN_FAILED', username, userId: user.id, details: 'Account deactivated', ctx });
      throw unauthorized(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
    }
    const { failedAttempts } = await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    if (failedAttempts >= policy.maxAttempts) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + policy.lockoutMinutes * 60_000) },
      });
      await writeAudit({
        action: 'ACCOUNT_LOCKED',
        username,
        userId: user.id,
        details: `Locked for ${policy.lockoutMinutes} min after ${failedAttempts} failed attempts`,
        ctx,
      });
      throw locked(`Too many failed attempts. Account locked for ${policy.lockoutMinutes} minutes.`);
    }
    await writeAudit({
      action: 'LOGIN_FAILED',
      username,
      userId: user.id,
      details: `Wrong password (attempt ${failedAttempts} of ${policy.maxAttempts})`,
      ctx,
    });
    throw unauthorized(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  }

  const fresh = await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() },
  });
  const session = await issueSession(fresh, ctx, policy.singleSession);
  await writeAudit({ action: 'LOGIN', username, userId: user.id, details: `Successful login by ${user.name}`, ctx });

  return { session, user: await toUserDto(fresh) };
}

// ---------------------------------------------------------------------------
// Refresh — rotates the refresh token in place, keeping the same session id (spec #28)
// ---------------------------------------------------------------------------
export async function refresh(rawToken: string, ctx: RequestContext, background = false) {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!session) {
    // Was this token already rotated? Re-use outside the grace window means it was likely stolen.
    const rotated = await prisma.refreshToken.findFirst({
      where: { previousTokenHash: tokenHash, revoked: false },
      include: { user: true },
    });
    if (rotated && rotated.rotatedAt && Date.now() - rotated.rotatedAt.getTime() > ROTATION_GRACE_MS) {
      await prisma.refreshToken.update({ where: { id: rotated.id }, data: { revoked: true, revokedReason: 'token_reuse' } });
      await writeAudit({
        action: 'TOKEN_REUSE',
        username: rotated.user.username,
        userId: rotated.userId,
        details: 'Previously rotated refresh token was presented again; session revoked',
        ctx,
      });
    }
    throw unauthorized('Session has ended', 'SESSION_ENDED');
  }

  const policy = await getSecurityConfig();
  const now = Date.now();
  if (session.revoked || session.expiresAt.getTime() <= now || !session.user.isActive) {
    throw unauthorized('Session has ended', 'SESSION_ENDED');
  }
  if (now - session.lastSeenAt.getTime() > policy.sessionTimeoutMinutes * 60_000) {
    await prisma.refreshToken.update({ where: { id: session.id }, data: { revoked: true, revokedReason: 'idle_timeout' } });
    await writeAudit({
      action: 'SESSION_TIMEOUT',
      username: session.user.username,
      userId: session.userId,
      details: `Session ended after ${policy.sessionTimeoutMinutes} min of inactivity`,
      ctx,
    });
    throw unauthorized('Session expired due to inactivity', 'SESSION_EXPIRED');
  }

  const nextToken = newRefreshToken();
  // Conditional on the old hash so two concurrent refreshes can't both succeed.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: session.id, tokenHash, revoked: false },
    // A refresh caused by background polling rotates the token but is not user activity (spec #28)
    data: {
      tokenHash: hashToken(nextToken),
      previousTokenHash: tokenHash,
      rotatedAt: new Date(now),
      ...(background ? {} : { lastSeenAt: new Date(now) }),
    },
  });
  if (count === 0) throw unauthorized('Session has ended', 'SESSION_ENDED');

  return {
    session: {
      accessToken: signAccessToken({ sub: session.userId, sid: session.id, role: session.user.role }),
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      refreshToken: nextToken,
      refreshExpiresAt: session.expiresAt,
    } satisfies IssuedSession,
    user: await toUserDto(session.user),
  };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
/** reason 'timeout': the client's idle timer ended the session (spec #28), audited as SESSION_TIMEOUT. */
export async function logout(sessionId: string, user: Express.AuthUser, ctx: RequestContext, reason: 'manual' | 'timeout' = 'manual') {
  const timeout = reason === 'timeout';
  await prisma.refreshToken.updateMany({
    where: { id: sessionId, revoked: false },
    data: { revoked: true, revokedReason: timeout ? 'idle_timeout' : 'logout' },
  });
  if (timeout) {
    const { sessionTimeoutMinutes } = await getSecurityConfig();
    await writeAudit({
      action: 'SESSION_TIMEOUT',
      username: user.username,
      userId: user.id,
      details: `Session ended after ${sessionTimeoutMinutes} min of inactivity`,
      ctx,
    });
  } else {
    await writeAudit({ action: 'LOGOUT', username: user.username, userId: user.id, details: `User ${user.name} logged out`, ctx });
  }
}

// ---------------------------------------------------------------------------
// Change own password (spec #29)
// ---------------------------------------------------------------------------
export async function changePassword(
  authUser: Express.AuthUser,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
  ctx: RequestContext,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await writeAudit({ action: 'PASSWORD_CHANGE_FAILED', username: user.username, userId: user.id, details: 'Current password incorrect', ctx });
    throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  }
  const policyError = validatePassword(newPassword, await getSecurityConfig());
  if (policyError) throw badRequest(policyError);
  if (await bcrypt.compare(newPassword, user.passwordHash)) throw badRequest('New password must differ from the current one');

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } }),
    // Keep this session; end any others that might be using the old credentials
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revoked: false, NOT: { id: sessionId } },
      data: { revoked: true, revokedReason: 'password_change' },
    }),
  ]);
  await writeAudit({ action: 'PASSWORD_CHANGE', username: user.username, userId: user.id, details: 'User changed own password', ctx });
}

// ---------------------------------------------------------------------------
// Admin password reset (spec #29, §19.1)
// ---------------------------------------------------------------------------
export function generateTemporaryPassword(minLength: number): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]!);
  while (chars.length < Math.max(12, minLength)) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

export async function adminResetPassword(admin: Express.AuthUser, userId: string, temporaryPassword: string | undefined, ctx: RequestContext) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('User not found');

  const policy = await getSecurityConfig();
  const password = temporaryPassword ?? generateTemporaryPassword(policy.minLength);
  const policyError = validatePassword(password, policy);
  if (policyError) throw badRequest(policyError);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
    }),
    prisma.refreshToken.updateMany({ where: { userId: target.id, revoked: false }, data: { revoked: true, revokedReason: 'admin_reset' } }),
  ]);
  await writeAudit({
    action: 'PASSWORD_RESET',
    username: admin.username,
    userId: admin.id,
    details: `Reset password for ${target.username}; change required at next login; sessions ended`,
    ctx,
  });

  // Returned once so the admin can hand it over; never stored in plain text or logged.
  return { userId: target.id, username: target.username, temporaryPassword: password };
}
