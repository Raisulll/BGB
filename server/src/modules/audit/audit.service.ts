import { logger, securityLogger } from '../../config/logger.js';
import { prisma } from '../../db.js';
import type { RequestContext } from '../../utils/requestContext.js';

// Spec #24 — every significant action is written to the hash-chained audit_log.
export interface AuditEntry {
  action: string;
  username: string;
  userId?: string | null;
  details?: string;
  ctx?: RequestContext;
}

// Security-relevant actions are mirrored to security.log (§25).
const SECURITY_ACTIONS = new Set([
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'ACCOUNT_LOCKED',
  'TOKEN_REUSE',
  'PERMISSION_DENIED',
  'PASSWORD_RESET',
  'PASSWORD_CHANGE',
  'SESSION_TIMEOUT',
]);

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const data = {
    action: entry.action,
    username: entry.username.slice(0, 50),
    userId: entry.userId ?? null,
    details: entry.details ?? null,
    ipAddress: entry.ctx?.ip ?? null,
    userAgent: entry.ctx?.userAgent ?? null,
  };

  if (SECURITY_ACTIONS.has(entry.action)) {
    securityLogger.warn(entry.action, { username: data.username, details: data.details, ip: data.ipAddress });
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    // Never lose an audit event silently: if the DB write fails, it still reaches the log files.
    logger.error('Failed to write audit entry', { err: String(err), stack: (err as Error)?.stack, entry: data });
    securityLogger.error('AUDIT_WRITE_FAILED', data);
  }
}
