import type { Prisma } from '../../generated/prisma/client.js';
import { canApprove, canReview, ROLES } from '../../utils/roles.js';
import { inScope, resolveScope } from '../../utils/scope.js';
import { enqueueWorkflowEmails, type EmailEvent } from './mailer.js';

// Spec #23 — workflow events notify the next responsible group (§23). Recipients must also
// have the incident inside their access scope. The actor never notifies themself.
type Tx = Prisma.TransactionClient;

export type WorkflowEvent = 'submitted' | 'reviewed' | 'verified' | 'approved' | 'closed' | 'returned' | 'rejected' | 'modified';

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
  // A reviewer changed the filer's report before approval (spec #14)
  modified: { roles: [], notifyCreator: true, title: 'Incident Modified', type: 'review' },
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
  // §23 — e-mail for new submission, approval, rejection and return
  if ((EMAIL_EVENTS as string[]).includes(event)) {
    await enqueueWorkflowEmails(tx, [...recipients], incident.id, event as EmailEvent, actor.name);
  }
}

const EMAIL_EVENTS: EmailEvent[] = ['submitted', 'approved', 'rejected', 'returned'];

/**
 * A new comment notifies the incident's creator and everyone who commented before, if they are
 * still active and the incident is still inside their scope. Never the author. In-app only.
 */
export async function notifyComment(tx: Tx, incident: IncidentRef, actor: { id: string; name: string }, body: string) {
  const earlier = await tx.incidentComment.findMany({ where: { incidentId: incident.id }, select: { userId: true }, distinct: ['userId'] });
  const ids = new Set([incident.createdBy, ...earlier.map((c) => c.userId)]);
  ids.delete(actor.id);
  if (ids.size === 0) return;
  const users = await tx.user.findMany({ where: { id: { in: [...ids] }, isActive: true }, select: { id: true, scope: true } });
  const recipients: string[] = [];
  for (const u of users) if (inScope(await resolveScope(u.scope), incident)) recipients.push(u.id);
  if (recipients.length === 0) return;
  const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      title: 'New Comment',
      message: `${incident.id} (${incident.title}): ${actor.name} commented: ${snippet}`.slice(0, 2000),
      type: 'comment',
      incidentId: incident.id,
    })),
  });
}
