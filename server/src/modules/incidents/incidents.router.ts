import { Router, type Request } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { exportHandler } from '../reports/reports.router.js';
import { requestContext } from '../../utils/requestContext.js';
import { commentSchema, createIncidentSchema, listIncidentsSchema, similarQuerySchema, updateIncidentSchema, workflowActionSchema } from './incidents.schema.js';
import * as service from './incidents.service.js';
import { archiveIncident, restoreIncident } from './archive.service.js';
import { WORKFLOW_ACTIONS, type WorkflowAction } from './workflow.js';

// §19.3 — /api/v1/incidents
export const incidentsRouter = Router();
incidentsRouter.use(requireAuth, apiLimiter);

const ID_PATTERN = /^BIRDS-\d{4}-\d{4,}$/;
function incidentId(req: Request) {
  const id = String(req.params.id ?? '');
  if (!ID_PATTERN.test(id)) throw notFound('Incident not found');
  return id;
}

incidentsRouter.get('/', requirePermission('incidents'), async (req, res) => {
  res.json(await service.listIncidents(req.user!, listIncidentsSchema.parse(req.query)));
});

// §19.3 — same export as /reports/export/:format
incidentsRouter.get('/export/:format', requirePermission('reports'), exportHandler);

// Categories + org hierarchy (within the user's scope) for the incident form
incidentsRouter.get('/meta', requirePermission('incidents'), async (req, res) => {
  res.json(await service.incidentMeta(req.user!));
});

// Possible duplicates of a report being filed (advisory; the form shows them)
incidentsRouter.get('/similar', requirePermission('create'), async (req, res) => {
  res.json(await service.similarIncidents(req.user!, similarQuerySchema.parse(req.query)));
});

incidentsRouter.post('/', requirePermission('create'), async (req, res) => {
  const input = createIncidentSchema.parse(req.body);
  res.status(201).json(await service.createIncident(req.user!, input, requestContext(req)));
});

incidentsRouter.get('/:id', requirePermission('incidents'), async (req, res) => {
  res.json(await service.getIncident(req.user!, incidentId(req)));
});

// Same BOP or within 5 km, within 30 days either side
incidentsRouter.get('/:id/related', requirePermission('incidents'), async (req, res) => {
  res.json(await service.relatedIncidents(req.user!, incidentId(req)));
});

incidentsRouter.get('/:id/timeline', requirePermission('incidents'), async (req, res) => {
  res.json(await service.getTimeline(req.user!, incidentId(req)));
});

incidentsRouter.patch('/:id', requirePermission('create'), async (req, res) => {
  const input = updateIncidentSchema.parse(req.body);
  res.json(await service.updateIncident(req.user!, incidentId(req), input, requestContext(req)));
});

// The creator discards a never-submitted draft (kept on record, hidden everywhere); reason optional
incidentsRouter.delete('/:id', requirePermission('create'), async (req, res) => {
  const { notes } = workflowActionSchema.parse(req.body ?? {});
  await service.discardDraft(req.user!, incidentId(req), notes, requestContext(req));
  res.status(204).end();
});

incidentsRouter.post('/:id/submit', requirePermission('create'), async (req, res) => {
  res.json(await service.submitIncident(req.user!, incidentId(req), requestContext(req)));
});

// Spec #45 — archive a final incident / restore it (HQ administrators; reason required to restore)
incidentsRouter.post('/:id/archive', requirePermission('admin'), async (req, res) => {
  res.json(await archiveIncident(req.user!, incidentId(req), requestContext(req)));
});

incidentsRouter.post('/:id/unarchive', requirePermission('admin'), async (req, res) => {
  const { notes } = workflowActionSchema.parse(req.body ?? {});
  res.json(await restoreIncident(req.user!, incidentId(req), notes, requestContext(req)));
});

// Comments (who may comment is decided in the service: filers and reviewers, not read-only roles)
incidentsRouter.post('/:id/comments', requirePermission('incidents'), async (req, res) => {
  const { body } = commentSchema.parse(req.body ?? {});
  res.status(201).json(await service.addComment(req.user!, incidentId(req), body, requestContext(req)));
});

// Audit entry for printing a single incident (the browser prints)
incidentsRouter.post('/:id/print', requirePermission('incidents'), async (req, res) => {
  await service.recordPrint(req.user!, incidentId(req), requestContext(req));
  res.status(204).end();
});

// review | verify | approve | close | return | reject — role checks live in the service
incidentsRouter.post('/:id/:action', requirePermission('incidents'), async (req, res) => {
  const action = String(req.params.action);
  if (!WORKFLOW_ACTIONS.includes(action as WorkflowAction)) throw notFound(`Unknown action "${action}"`);
  const { notes } = workflowActionSchema.parse(req.body ?? {});
  res.json(await service.runWorkflowAction(req.user!, incidentId(req), action as WorkflowAction, notes, requestContext(req)));
});
