import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { requestContext } from '../../utils/requestContext.js';
import { createCategorySchema, createOrgUnitSchema, updateCategorySchema, updateConfigSchema, updatePermissionsSchema } from './admin.schema.js';
import * as service from './admin.service.js';

// §19.8 — /api/v1/admin (specs #3, #6, #9, #46, #47). Backup routes come with Phase 5.
export const adminRouter = Router();
adminRouter.use(requireAuth, apiLimiter, requirePermission('admin'));

adminRouter.get('/config', async (_req, res) => {
  res.json(await service.getConfig());
});

adminRouter.patch('/config', async (req, res) => {
  const { values } = updateConfigSchema.parse(req.body);
  res.json(await service.updateConfig(req.user!, values, requestContext(req)));
});

adminRouter.get('/roles/permissions', async (_req, res) => {
  res.json(await service.getPermissions());
});

adminRouter.patch('/roles/permissions', async (req, res) => {
  res.json(await service.updatePermissions(req.user!, updatePermissionsSchema.parse(req.body), requestContext(req)));
});

adminRouter.post('/roles/permissions/reset', async (req, res) => {
  res.json(await service.resetPermissions(req.user!, requestContext(req)));
});

adminRouter.get('/categories', async (_req, res) => {
  res.json(await service.getCategories());
});

adminRouter.post('/categories', async (req, res) => {
  res.status(201).json(await service.createCategory(req.user!, createCategorySchema.parse(req.body), requestContext(req)));
});

adminRouter.patch('/categories/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!/^CAT\d{2,}$/.test(id)) throw notFound('Category not found');
  res.json(await service.updateCategory(req.user!, id, updateCategorySchema.parse(req.body), requestContext(req)));
});

adminRouter.get('/org-hierarchy', async (_req, res) => {
  res.json(await service.getOrgHierarchy());
});

adminRouter.post('/org-hierarchy', async (req, res) => {
  res.status(201).json(await service.createOrgUnit(req.user!, createOrgUnitSchema.parse(req.body), requestContext(req)));
});
