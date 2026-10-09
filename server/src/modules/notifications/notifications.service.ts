import type { Prisma } from '../../generated/prisma/client.js';
import { canApprove, canReview, ROLES } from '../../utils/roles.js';
import { inScope, resolveScope } from '../../utils/scope.js';

// Spec #23 — workflow events notify the next responsible group (§23). Recipients must also
// have the incident inside their access scope. The actor never notifies themself.
type Tx = Prisma.TransactionClient;

export type WorkflowEvent = 'submitted' | 'reviewed' | 'verified' | 'approved' | 'closed' | 'returned' | 'rejected';

interface IncidentRef {
  id: string;
  title: string;
  createdBy: string;
  sector: string | null;
  battalion: string | null;
  bop: string | null;
}

const ALL_ROLES = Object.values(ROLES) as string[];

// Who acts next, and whether the creator should hear about it
const ROUTING: Record<WorkflowEvent, { roles: string[]; notifyCreator: boolean; title: string; type: string }> = {
  submitted: { roles: ALL_ROLES.filter(canReview), notifyCreator: false, title: 'New Incident Submitted', type: 'submission' },
  reviewed: { roles: ALL_ROLES.filter(canApprove), notifyCreator: true, title: 'Incident Reviewed', type: 'review' },
  verified: { roles: ALL_ROLES.filter(canApprove), notifyCreator: true, title: 'Incident Verified', type: 'review' },
  approved: { roles: [ROLES.HQ_ADMIN], notifyCreator: true, title: 'Incident Approved', type: 'approval' },
  closed: { roles: [], notifyCreator: true, title: 'Incident Closed', type: 'review' },
  returned: { roles: [], notifyCreator: true, title: 'Incident Returned', type: 'return' },
  rejected: { roles: [], notifyCreator: true, title: 'Incident Rejected', type: 'review' },
};

export async function notifyWorkflow(tx: Tx, incident: IncidentRef, event: WorkflowEvent, actor: { id: string; name: string }, notes?: string | null) {
  const route = ROUTING[event];
  const recipients = new Set<string>();

  if (route.roles.length) {
    const candidates = await tx.user.findMany({
      where: { isActive: true, role: { in: route.roles } },
      select: { id: true, scope: true },
    });
    for (const u of candidates) {
      if (inScope(await resolveScope(u.scope), incident)) recipients.add(u.id);
    }
  }
  if (route.notifyCreator) recipients.add(incident.createdBy);
  recipients.delete(actor.id);
  if (recipients.size === 0) return;

  const message = `${incident.id} (${incident.title}) ${event} by ${actor.name}${notes ? `: ${notes}` : ''}`.slice(0, 2000);
  await tx.notification.createMany({
    data: [...recipients].map((userId) => ({ userId, title: route.title, message, type: route.type, incidentId: incident.id })),
  });
}
