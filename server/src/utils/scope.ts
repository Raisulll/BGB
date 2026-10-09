import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';

// Spec #3 "access scopes" + spec #9 hierarchy. A user's `scope` is a node in the
// HQ → Sector → Battalion → BOP tree; they see incidents at or below that node. See DOUBT-008.
export type ScopeFilter =
  | { level: 'all' }
  | { level: 'sector'; sector: string }
  | { level: 'battalion'; battalion: string }
  | { level: 'bop'; bop: string }
  | { level: 'none' }; // unknown scope value → sees nothing (fail closed)

export interface OrgRow {
  sector: string;
  battalion: string;
  bop: string;
}

const CACHE_MS = 60_000;
let cache: { at: number; rows: OrgRow[] } | null = null;

export async function orgHierarchy(): Promise<OrgRow[]> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const rows = await prisma.orgHierarchy.findMany({ select: { sector: true, battalion: true, bop: true } });
    cache = { at: Date.now(), rows };
  }
  return cache.rows;
}

export function invalidateOrgCache() {
  cache = null;
}

export async function resolveScope(scope: string): Promise<ScopeFilter> {
  if (scope === 'HQ') return { level: 'all' };
  const rows = await orgHierarchy();
  if (rows.some((r) => r.sector === scope)) return { level: 'sector', sector: scope };
  if (rows.some((r) => r.battalion === scope)) return { level: 'battalion', battalion: scope };
  if (rows.some((r) => r.bop === scope)) return { level: 'bop', bop: scope };
  return { level: 'none' };
}

/** Prisma where-clause restricting incidents to the scope. */
export function scopeWhere(filter: ScopeFilter): Prisma.IncidentWhereInput {
  switch (filter.level) {
    case 'all':
      return {};
    case 'sector':
      return { sector: filter.sector };
    case 'battalion':
      return { battalion: filter.battalion };
    case 'bop':
      return { bop: filter.bop };
    case 'none':
      return { id: { in: [] } };
  }
}

export function inScope(filter: ScopeFilter, loc: { sector?: string | null; battalion?: string | null; bop?: string | null }) {
  switch (filter.level) {
    case 'all':
      return true;
    case 'sector':
      return loc.sector === filter.sector;
    case 'battalion':
      return loc.battalion === filter.battalion;
    case 'bop':
      return loc.bop === filter.bop;
    case 'none':
      return false;
  }
}

/** Spec #9 — the sector/battalion/BOP triple must exist in org_hierarchy. */
export async function isValidLocation(sector: string, battalion: string, bop: string) {
  return (await orgHierarchy()).some((r) => r.sector === sector && r.battalion === battalion && r.bop === bop);
}
