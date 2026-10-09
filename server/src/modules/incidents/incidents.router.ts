import { Router, type Request } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { exportHandler } from '../reports/reports.router.js';
import { requestContext } from '../../utils/requestContext.js';
import { createIncidentSchema, listIncidentsSchema, updateIncidentSchema, workflowActionSchema } from './incidents.schema.js';
import * as service from './incidents.service.js';
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

incidentsRouter.post('/', requirePermission('create'), async (req, res) => {
  const input = createIncidentSchema.parse(req.body);
  res.status(201).json(await service.createIncident(req.user!, input, requestContext(req)));
});

incidentsRouter.get('/:id', requirePermission('incidents'), async (req, res) => {
  res.json(await service.getIncident(req.user!, incidentId(req)));
});

incidentsRouter.get('/:id/timeline', requirePermission('incidents'), async (req, res) => {
  res.json(await service.getTimeline(req.user!, incidentId(req)));
});

incidentsRouter.patch('/:id', requirePermission('create'), async (req, res) => {
  const input = updateIncidentSchema.parse(req.body);
  res.json(await service.updateIncident(req.user!, incidentId(req), input, requestContext(req)));
});

incidentsRouter.post('/:id/submit', requirePermission('create'), async (req, res) => {
  res.json(await service.submitIncident(req.user!, incidentId(req), requestContext(req)));
});

// review | verify | approve | close | return | reject — role checks live in the service
incidentsRouter.post('/:id/:action', requirePermission('incidents'), async (req, res) => {
  const action = String(req.params.action);
  if (!WORKFLOW_ACTIONS.includes(action as WorkflowAction)) throw notFound(`Unknown action "${action}"`);
  const { notes } = workflowActionSchema.parse(req.body ?? {});
  res.json(await service.runWorkflowAction(req.user!, incidentId(req), action as WorkflowAction, notes, requestContext(req)));
});
