import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toBstDisplay } from '../../utils/formatDate.js';

// Spec #23 — workflow e-mail through a transactional outbox:
//  1. enqueueWorkflowEmails() writes email_outbox rows inside the workflow transaction, so an action
//     that rolls back never sends mail;
//  2. the worker claims due rows with FOR UPDATE SKIP LOCKED (safe with several PM2 workers), sends
//     them, and retries with back-off when the SMTP server is unavailable.
// Messages carry the reference number and a link only: incident details stay inside BIRDS, because
// mail may cross networks BIRDS doesn't control.

type Tx = Prisma.TransactionClient;
export type EmailEvent = 'submitted' | 'approved' | 'rejected' | 'returned';

const MAX_ATTEMPTS = 5;
const BATCH = 20;
const POLL_MS = 15_000;
const LEASE_MINUTES = 5; // a claimed row is skipped by other workers for this long

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (env.MAIL_TRANSPORT === 'none') return null;
  if (!transporter) {
    transporter =
      env.MAIL_TRANSPORT === 'json'
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            requireTLS: !env.SMTP_SECURE, // never send credentials or content in clear text
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
          });
  }
  return transporter;
}

export const mailEnabled = () => env.MAIL_TRANSPORT !== 'none';

const SUBJECT: Record<EmailEvent, string> = {
  submitted: 'submitted for review',
  approved: 'approved',
  rejected: 'rejected',
  returned: 'returned for correction',
};

export function renderWorkflowEmail(incidentId: string, event: EmailEvent, actorName: string, at = new Date()) {
  const link = `${env.APP_BASE_URL.replace(/\/$/, '')}/incidents/${encodeURIComponent(incidentId)}`;
  const subject = `[BIRDS] ${incidentId} ${SUBJECT[event]}`;
  const bodyText = [
    'CONFIDENTIAL // OPERATIONAL',
    '',
    `Incident ${incidentId} was ${SUBJECT[event]} by ${actorName} on ${toBstDisplay(at)} (BST).`,
    '',
    `Open it in BIRDS: ${link}`,
    '',
    'Details are available only inside BIRDS. Do not forward this message.',
    '— BIRDS automated notification, Headquarters Border Guard Bangladesh',
  ].join('\n');
  return { subject, bodyText };
}

/** Called inside the workflow transaction with the in-app notification recipients. */
export async function enqueueWorkflowEmails(tx: Tx, userIds: string[], incidentId: string, event: EmailEvent, actorName: string) {
  if (!mailEnabled() || userIds.length === 0) return;
  const users = await tx.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: { id: true, email: true } });
  const { subject, bodyText } = renderWorkflowEmail(incidentId, event, actorName);
  await tx.emailOutbox.createMany({
    data: users.filter((u) => u.email).map((u) => ({ toUserId: u.id, toEmail: u.email, subject, bodyText, event, incidentId })),
  });
}

interface OutboxRow {
  id: number;
  to_email: string;
  subject: string;
  body_text: string;
  attempts: number;
}

/** Sends due outbox rows once. Returns how many were sent and failed. */
export async function processOutbox(): Promise<{ sent: number; failed: number }> {
  const transport = getTransport();
  if (!transport) return { sent: 0, failed: 0 };

  // Claim a batch: bump attempts and push next_attempt_at forward as a lease
  const rows = await prisma.$queryRaw<OutboxRow[]>`
    UPDATE email_outbox
       SET attempts = attempts + 1, next_attempt_at = now() + make_interval(mins => ${LEASE_MINUTES})
     WHERE id IN (
       SELECT id FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED)
    RETURNING id, to_email, subject, body_text, attempts`;

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await transport.sendMail({ from: env.MAIL_FROM, to: row.to_email, subject: row.subject, text: row.body_text });
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), lastError: null } });
      sent++;
    } catch (err) {
      const giveUp = row.attempts >= MAX_ATTEMPTS;
      const backoffMin = row.attempts * row.attempts; // 1, 4, 9, 16 minutes
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: giveUp ? 'failed' : 'pending',
          lastError: String((err as Error)?.message ?? err).slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
        },
      });
      if (giveUp) failed++;
      logger.warn('E-mail delivery failed', { outboxId: row.id, attempts: row.attempts, giveUp, err: String(err) });
    }
  }
  return { sent, failed };
}

let timer: NodeJS.Timeout | null = null;
/** Starts the background sender (server.ts). No-op when e-mail is disabled. */
export function startMailWorker() {
  if (!mailEnabled() || timer) return;
  const tick = () => processOutbox().catch((err) => logger.error('Mail worker error', { err: String(err) }));
  timer = setInterval(tick, POLL_MS);
  timer.unref();
  void tick();
  logger.info(`Mail worker started (${env.MAIL_TRANSPORT}${env.MAIL_TRANSPORT === 'smtp' ? ` ${env.SMTP_HOST}:${env.SMTP_PORT}` : ''})`);
}

export function stopMailWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Status for Admin › Security & System. */
export async function mailStatus() {
  const counts = await prisma.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } });
  const by = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const recent = await prisma.emailOutbox.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    select: { id: true, toEmail: true, subject: true, event: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true },
  });
  return {
    enabled: mailEnabled(),
    transport: env.MAIL_TRANSPORT,
    from: env.MAIL_FROM,
    server: env.MAIL_TRANSPORT === 'smtp' ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : null,
    counts: { pending: by.pending ?? 0, sent: by.sent ?? 0, failed: by.failed ?? 0 },
    recent,
  };
}

/** Admin test message to their own address; queued and sent immediately. */
export async function sendTestEmail(admin: { id: string; name: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: { email: true } });
  await prisma.emailOutbox.create({
    data: {
      toUserId: admin.id,
      toEmail: user.email,
      subject: '[BIRDS] Test message',
      bodyText: `CONFIDENTIAL // OPERATIONAL\n\nThis is a test message requested by ${admin.name} on ${toBstDisplay(new Date())} (BST).\nE-mail delivery from BIRDS is working.`,
      event: 'test',
    },
  });
  return { to: user.email, ...(await processOutbox()) };
}
