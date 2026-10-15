import webpush from 'web-push';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db.js';
import type { RequestContext } from '../../utils/requestContext.js';
import { writeAudit } from '../audit/audit.service.js';

// Web push (spec #58 extension, DOUBT-015): calls and messages reach a device while BIRDS is
// closed. Payloads are end-to-end encrypted to the browser (RFC 8291), so the push service
// (Google, Apple, Mozilla) can't read them; they still carry names only, never message text,
// because a lock screen can be seen by anyone holding the phone. The service worker turns the
// payload into a notification in the user's language.
//
// A subscription belongs to the sign-in session it was registered in. Pushes go only to
// subscriptions whose session is neither revoked (signed out, signed out elsewhere, deactivated)
// nor expired, so signing out stops them at once.

type AuthUser = Express.AuthUser;

export type PushPayload =
  | { kind: 'message'; conversationId: number; senderName: string; groupTitle: string | null; voice: boolean }
  | { kind: 'call'; callId: number; callerName: string; ringSeconds: number; declineToken: string }
  | { kind: 'call-ended'; callId: number; callerName: string; missed: boolean }
  // Flash Alert: reference, priority and sender only; the content is read in the app after sign-in
  | { kind: 'alert'; alertId: number; reference: string; priority: string; senderName: string; event: 'raised' | 'updated' };

let configured: boolean | null = null;
export function pushEnabled() {
  if (configured === null) {
    configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (configured) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  }
  return configured;
}

export const pushConfig = () => ({ enabled: pushEnabled(), publicKey: pushEnabled() ? env.VAPID_PUBLIC_KEY! : null });

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  resume?: boolean;
}

/**
 * Registers this device for the user's current session. `resume` (sent on every app start when
 * the browser already has a subscription) only re-binds a device this user turned on before; it
 * never takes over a device someone else registered (shared phones).
 */
export async function subscribe(user: AuthUser, sessionId: string, input: SubscriptionInput, ctx: RequestContext) {
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
  if (input.resume && existing?.userId !== user.id) return { active: false };
  const data = {
    userId: user.id,
    sessionId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: ctx.userAgent?.slice(0, 500) ?? null,
  };
  await prisma.pushSubscription.upsert({ where: { endpoint: input.endpoint }, update: data, create: { endpoint: input.endpoint, ...data } });
  if (!input.resume) {
    await writeAudit({ action: 'PUSH_SUBSCRIBE', username: user.username, userId: user.id, details: `Turned on notifications on ${ctx.userAgent?.slice(0, 120) ?? 'a device'}`, ctx });
  }
  return { active: true };
}

export async function unsubscribe(user: AuthUser, endpoint: string, ctx: RequestContext) {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  if (count) await writeAudit({ action: 'PUSH_UNSUBSCRIBE', username: user.username, userId: user.id, details: `Turned off notifications on ${ctx.userAgent?.slice(0, 120) ?? 'a device'}`, ctx });
  return { active: false };
}

/** Whether this device (endpoint) is registered for the user's current session. */
export async function status(user: AuthUser, sessionId: string, endpoint?: string) {
  if (!endpoint) return { active: false };
  const s = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  return { active: Boolean(s && s.userId === user.id && s.sessionId === sessionId) };
}

export interface PushOptions {
  ttlSeconds: number; // how long the push service keeps it for an offline device
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  topic?: string; // a newer push with the same topic replaces an undelivered one
}

/**
 * Sends to every live device of these users. Never throws and never blocks the caller's work:
 * call it without awaiting. Devices the push service reports gone (404/410) are deleted.
 */
export async function pushToUsers(userIds: string[], payload: PushPayload, options: PushOptions) {
  try {
    if (!pushEnabled() || userIds.length === 0) return;
    const subs = await prisma.pushSubscription.findMany({
      where: {
        userId: { in: [...new Set(userIds)] },
        user: { isActive: true },
        session: { revoked: false, expiresAt: { gt: new Date() } },
      },
    });
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: options.ttlSeconds,
            urgency: options.urgency ?? 'normal',
            topic: options.topic,
            timeout: 10_000,
          });
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } }).catch(() => {});
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            logger.warn('Push delivery failed', { subscription: s.id, statusCode, err: String((err as Error).message ?? err) });
          }
        }
      }),
    );
  } catch (err) {
    logger.warn('Push send failed', { err: String(err) });
  }
}
