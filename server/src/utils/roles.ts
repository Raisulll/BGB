// Mirrors BGB/src/utils/helpers.js and BGB/src/context/AppContext.jsx so the API and the
// frontend agree on who may do what (spec #3). Keep both sides in sync.

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

export const PAGE_IDS = ['dashboard', 'incidents', 'create', 'map', 'analytics', 'reports', 'audit', 'admin'] as const;
export type PageId = (typeof PAGE_IDS)[number];

export const DEFAULT_PERMISSIONS: Record<string, PageId[]> = {
  [ROLES.HQ_ADMIN]: ['dashboard', 'incidents', 'create', 'map', 'analytics', 'reports', 'audit', 'admin'],
  [ROLES.SECTOR_OFFICER]: ['dashboard', 'incidents', 'create', 'map', 'analytics', 'reports'],
  [ROLES.BATTALION_OPERATOR]: ['dashboard', 'incidents', 'create', 'map'],
  [ROLES.VERIFIER]: ['dashboard', 'incidents', 'map', 'analytics', 'reports'],
  [ROLES.AUDITOR]: ['dashboard', 'incidents', 'analytics', 'reports', 'audit'],
};

// Capability groups used by the workflow endpoints (Phase 2)
export const canReview = (role: string) => [ROLES.SECTOR_OFFICER, ROLES.VERIFIER, ROLES.HQ_ADMIN].includes(role as never);
export const canApprove = (role: string) => [ROLES.VERIFIER, ROLES.HQ_ADMIN].includes(role as never);
export const isAdmin = (role: string) => role === ROLES.HQ_ADMIN;
