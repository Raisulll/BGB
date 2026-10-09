import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { writeAudit } from '../modules/audit/audit.service.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { requestContext } from '../utils/requestContext.js';
import type { PageId } from '../utils/roles.js';

// Spec #3 — permissions come from role_permissions, so changes made in the Admin panel apply
// without a deploy. Cached briefly; call invalidatePermissionCache() after editing the matrix.
const CACHE_MS = 30_000;
let cache: { at: number; map: Map<string, Set<string>> } | null = null;

export function invalidatePermissionCache() {
  cache = null;
}

export async function permissionsFor(role: string): Promise<string[]> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const rows = await prisma.rolePermission.findMany({ where: { enabled: true } });
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!map.has(r.role)) map.set(r.role, new Set());
      map.get(r.role)!.add(r.pageId);
    }
    cache = { at: Date.now(), map };
  }
  return [...(cache.map.get(role) ?? [])];
}

/** Route guard: the role must have at least one of the listed pages enabled. Denials are audited. */
export function requireAnyPermission(...pageIds: PageId[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(unauthorized());
    permissionsFor(user.role)
      .then(async (perms) => {
        if (pageIds.some((p) => perms.includes(p))) return next();
        await writeAudit({
          action: 'PERMISSION_DENIED',
          username: user.username,
          userId: user.id,
          details: `${req.method} ${req.originalUrl} requires ${pageIds.length > 1 ? 'one of ' : ''}"${pageIds.join('", "')}" (role: ${user.role})`,
          ctx: requestContext(req),
        });
        next(forbidden());
      })
      .catch(next);
  };
}

/** Route guard: the user's role must have `pageId` enabled. */
export const requirePermission = (pageId: PageId) => requireAnyPermission(pageId);
