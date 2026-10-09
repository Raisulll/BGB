import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { writeAudit } from '../audit/audit.service.js';
import { mailEnabled, mailStatus, sendTestEmail } from '../notifications/mailer.js';
import { archiveSummary, runArchiving } from '../incidents/archive.service.js';
import { requestContext } from '../../utils/requestContext.js';
import { createCategorySchema, createOrgUnitSchema, updateCategorySchema, updateConfigSchema, updatePermissionsSchema } from './admin.schema.js';
import * as service from './admin.service.js';

// §19.8 — /api/v1/admin (specs #3, #6, #9, #23, #44-#47). Backup routes are deferred for the demo version.
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

// Spec #23 — e-mail delivery status and a test message to the admin's own address
adminRouter.get('/mail', async (_req, res) => {
  res.json(await mailStatus());
});

adminRouter.post('/mail/test', async (req, res) => {
  if (!mailEnabled()) throw badRequest('E-mail is not configured on this server (set SMTP_HOST)');
  const result = await sendTestEmail(req.user!);
  await writeAudit({ action: 'MAIL_TEST', username: req.user!.username, userId: req.user!.id, details: `Test e-mail to ${result.to}: ${result.sent ? 'sent' : 'not sent'}`, ctx: requestContext(req) });
  res.json(result);
});

// Specs #44, #45 — archiving status and an on-demand run (the same job also runs daily)
adminRouter.get('/archive', async (_req, res) => {
  res.json(await archiveSummary());
});

adminRouter.post('/archive/run', async (req, res) => {
  const result = await runArchiving(req.user!, requestContext(req));
  res.json({ ...result, summary: await archiveSummary() });
});
