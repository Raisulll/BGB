// Roles, default page permissions and capability groups (spec #3). The frontend has no copy: it
// renders what the API returns (effective permissions, per-incident `actions` / `canEdit`).

export const ROLES = {
  HQ_ADMIN: 'HQ Administrator',
  SECTOR_OFFICER: 'Sector Officer',
  BATTALION_OPERATOR: 'Battalion Operator',
  VERIFIER: 'Verifier/Approver',
  AUDITOR: 'Auditor',
} as const;

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  [ROLES.HQ_ADMIN]: 'Full system administration, configuration and closure of incidents',
  [ROLES.SECTOR_OFFICER]: 'Files incidents and performs supervisory review within the sector',
  [ROLES.BATTALION_OPERATOR]: 'Files and edits incident reports for the battalion and its BOPs',
  [ROLES.VERIFIER]: 'Verifies and approves reviewed incidents',
  [ROLES.AUDITOR]: 'Read-only access to records, reports and the audit trail',
};

export const PAGE_IDS = ['dashboard', 'incidents', 'create', 'map', 'analytics', 'reports', 'audit', 'admin', 'messages'] as const;
export type PageId = (typeof PAGE_IDS)[number];

export const DEFAULT_PERMISSIONS: Record<string, PageId[]> = {
  [ROLES.HQ_ADMIN]: ['dashboard', 'incidents', 'create', 'map', 'analytics', 'reports', 'audit', 'admin', 'messages'],
  [ROLES.SECTOR_OFFICER]: ['dashboard', 'incidents', 'create', 'map', 'analytics', 'reports', 'messages'],
  [ROLES.BATTALION_OPERATOR]: ['dashboard', 'incidents', 'create', 'map', 'messages'],
  [ROLES.VERIFIER]: ['dashboard', 'incidents', 'map', 'analytics', 'reports', 'messages'],
  [ROLES.AUDITOR]: ['dashboard', 'incidents', 'analytics', 'reports', 'audit', 'messages'],
};

// Capability groups used by the workflow endpoints (Phase 2)
export const canReview = (role: string) => [ROLES.SECTOR_OFFICER, ROLES.VERIFIER, ROLES.HQ_ADMIN].includes(role as never);
export const canApprove = (role: string) => [ROLES.VERIFIER, ROLES.HQ_ADMIN].includes(role as never);
export const isAdmin = (role: string) => role === ROLES.HQ_ADMIN;
