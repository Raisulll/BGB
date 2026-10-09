import { Router, type CookieOptions, type Response } from 'express';
import { isProduction } from '../../config/env.js';
import { prisma } from '../../db.js';
import { requireAuth, requireAuthAllowPasswordChange } from '../../middleware/auth.js';
import { apiLimiter, loginLimiter, refreshLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { unauthorized } from '../../utils/errors.js';
import { isBackgroundRequest, requestContext } from '../../utils/requestContext.js';
import { getSecurityConfig } from '../admin/config.service.js';
import { adminResetPasswordSchema, changePasswordSchema, loginSchema } from './auth.schema.js';
import * as auth from './auth.service.js';

// §19.1 — /api/v1/auth
export const authRouter = Router();

// The refresh token lives only in an httpOnly cookie scoped to the auth routes, so page scripts
// (and any XSS) can't read it. The short-lived access token is returned in the body.
const REFRESH_COOKIE = 'birds_rt';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

function sendSession(res: Response, result: { session: auth.IssuedSession; user: unknown }) {
  const { session, user } = result;
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, expires: session.refreshExpiresAt });
  res.json({ accessToken: session.accessToken, tokenType: 'Bearer', expiresIn: session.expiresIn, user });
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  sendSession(res, await auth.login(username, password, requestContext(req)));
});

authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string' || !token) throw unauthorized('No active session', 'SESSION_ENDED');
  try {
    sendSession(res, await auth.refresh(token, requestContext(req), isBackgroundRequest(req)));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw err;
  }
});

authRouter.post('/logout', requireAuthAllowPasswordChange, async (req, res) => {
  const reason = req.body?.reason === 'timeout' ? 'timeout' : 'manual';
  await auth.logout(req.sessionId!, req.user!, requestContext(req), reason);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

// Current user + effective permissions, used by the frontend to hydrate AppContext
authRouter.get('/me', requireAuthAllowPasswordChange, apiLimiter, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  // Every role needs the idle timeout (client-side warning) and the password rules (change-password form).
  // Lockout thresholds stay admin-only.
  const cfg = await getSecurityConfig();
  res.json({
    user: await auth.toUserDto(user),
    policy: {
      sessionTimeoutMinutes: cfg.sessionTimeoutMinutes,
      password: {
        minLength: cfg.minLength,
        requireUppercase: cfg.requireUppercase,
        requireNumber: cfg.requireNumber,
        requireSpecial: cfg.requireSpecial,
      },
    },
  });
});

// Own profile: account details, active sessions, recent sign-in events
authRouter.get('/profile', requireAuth, apiLimiter, async (req, res) => {
  res.json(await auth.profile(req.user!, req.sessionId!));
});

authRouter.post('/sessions/revoke-others', requireAuth, apiLimiter, async (req, res) => {
  res.json(await auth.revokeOtherSessions(req.user!, req.sessionId!, requestContext(req)));
});

authRouter.post('/change-password', requireAuthAllowPasswordChange, apiLimiter, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await auth.changePassword(req.user!, req.sessionId!, currentPassword, newPassword, requestContext(req));
  res.status(204).end();
});

authRouter.post('/admin/reset-password', requireAuth, apiLimiter, requirePermission('admin'), async (req, res) => {
  const { userId, temporaryPassword } = adminResetPasswordSchema.parse(req.body);
  res.json(await auth.adminResetPassword(req.user!, userId, temporaryPassword, requestContext(req)));
});
