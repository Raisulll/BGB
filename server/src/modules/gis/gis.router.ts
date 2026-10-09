import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { listIncidentsSchema } from '../incidents/incidents.schema.js';
import { gisIncidents } from '../incidents/incidents.service.js';

// §19.9 — /api/v1/gis (specs #8, #18)
export const gisRouter = Router();
gisRouter.use(requireAuth, apiLimiter);

const gisQuery = listIncidentsSchema.pick({ status: true, severity: true, category: true, dateFrom: true, dateTo: true });

gisRouter.get('/incidents', requirePermission('map'), async (req, res) => {
  res.json(await gisIncidents(req.user!, gisQuery.parse(req.query)));
});
