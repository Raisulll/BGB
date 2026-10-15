import { canApprove, canReview, isAdmin } from '../../utils/roles.js';

// Specs #13, #14 — the single workflow table. The frontend has no copy: it renders the buttons
// from the `actions` each incident response carries (BGB IncidentDetail / IncidentList), and the
// Admin > Workflow tab describes these rules (keep its text in step with changes here).
export type WorkflowAction = 'review' | 'return' | 'verify' | 'reject' | 'approve' | 'close';

export interface WorkflowStep {
  status: string; // resulting status
  past: string; // timeline/audit wording
  from: readonly string[];
  allowed: (role: string) => boolean;
  requiresNotes: boolean; // a reason must be recorded
}

export const WORKFLOW: Record<WorkflowAction, WorkflowStep> = {
  review: { status: 'Reviewed', past: 'Reviewed', from: ['Submitted'], allowed: canReview, requiresNotes: false },
  return: { status: 'Returned', past: 'Returned', from: ['Submitted', 'Reviewed', 'Verified'], allowed: canReview, requiresNotes: true },
  verify: { status: 'Verified', past: 'Verified', from: ['Reviewed'], allowed: canApprove, requiresNotes: false },
  reject: { status: 'Rejected', past: 'Rejected', from: ['Submitted', 'Reviewed', 'Verified'], allowed: canReview, requiresNotes: true },
  approve: { status: 'Approved', past: 'Approved', from: ['Verified'], allowed: canApprove, requiresNotes: false },
  close: { status: 'Closed', past: 'Closed', from: ['Approved'], allowed: isAdmin, requiresNotes: false },
};

export const WORKFLOW_ACTIONS = Object.keys(WORKFLOW) as WorkflowAction[];

/** Statuses in which the creator may edit or (re)submit the record (spec #25). */
export const EDITABLE_STATUSES = ['Draft', 'Returned'] as const;
export const isEditableStatus = (status: string) => (EDITABLE_STATUSES as readonly string[]).includes(status);

/**
 * Spec #14 — a supervisory officer may modify a report before it is approved: while it waits in
 * review/verification, if their role may act on it at that stage (and it is not their own report).
 */
export const REVIEW_EDIT_STATUSES = ['Submitted', 'Reviewed', 'Verified'] as const;
export const canModifyAsReviewer = (status: string, role: string) =>
  (REVIEW_EDIT_STATUSES as readonly string[]).includes(status) && availableActions(status, role).length > 0;

/** Final statuses; only these can be archived (spec #45, DB CHECK incidents_archive_final_check). */
export const ARCHIVABLE_STATUSES = ['Closed', 'Rejected'] as const;
export const isArchivableStatus = (status: string) => (ARCHIVABLE_STATUSES as readonly string[]).includes(status);

/** Statuses that wait on someone (reviewer, approver, HQ, or the filer for corrections): these can be overdue. */
export const OVERDUE_STATUSES = ['Submitted', 'Reviewed', 'Verified', 'Approved', 'Returned'] as const;

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const STATUSES = ['Draft', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed', 'Returned', 'Rejected'] as const;

/** Statuses in which this role has at least one workflow action ("Needs my action"). */
export const actionableStatuses = (role: string) => [
  ...new Set(WORKFLOW_ACTIONS.filter((a) => WORKFLOW[a].allowed(role)).flatMap((a) => WORKFLOW[a].from)),
];

/** Actions this role may take on an incident in `status` (separation-of-duties is checked separately). */
export const availableActions = (status: string, role: string) =>
  WORKFLOW_ACTIONS.filter((a) => WORKFLOW[a].from.includes(status) && WORKFLOW[a].allowed(role));
