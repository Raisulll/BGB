import { Router, type Request } from 'express';
import multer from 'multer';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { requestContext } from '../../utils/requestContext.js';
import { alertNoteSchema, alertUpdateSchema, listAlertsSchema, previewSchema, raiseAlertSchema } from './alerts.schema.js';
import * as service from './alerts.service.js';

// /api/v1/alerts — Flash Alerts. Every signed-in user receives the alerts for their area; raising
// one needs the "raise_alert" permission; updates and closing are for the sender or an HQ administrator.
export const alertsRouter = Router();
alertsRouter.use(requireAuth, apiLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: env.EVIDENCE_MAX_FILE_MB * 1024 * 1024, files: env.EVIDENCE_MAX_FILES_PER_UPLOAD, fields: 5, fieldSize: 64 * 1024 },
}).array('files', env.EVIDENCE_MAX_FILES_PER_UPLOAD);

function alertId(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Alert not found');
  return id;
}

alertsRouter.get('/', async (req, res) => {
  res.json(await service.listAlerts(req.user!, listAlertsSchema.parse(req.query)));
});

alertsRouter.get('/active', async (req, res) => {
  res.json(await service.activeAlerts(req.user!));
});

alertsRouter.get('/options', requirePermission('raise_alert'), async (_req, res) => {
  res.json(await service.alertOptions());
});

alertsRouter.get('/preview', requirePermission('raise_alert'), async (req, res) => {
  res.json(await service.previewRecipients(req.user!, previewSchema.parse(req.query).sectors));
});

// multipart: "data" = JSON of the alert, "files" = attachments (optional)
alertsRouter.post('/', requirePermission('raise_alert'), upload, async (req, res) => {
  let data: unknown;
  try {
    data = JSON.parse(String(req.body?.data ?? ''));
  } catch {
    throw badRequest('Form field "data" must be the alert as JSON');
  }
  const input = raiseAlertSchema.parse(data);
  const files = (req.files ?? []) as service.UploadedFile[];
  res.status(201).json(await service.raiseAlert(req.user!, input, files, requestContext(req)));
});

alertsRouter.get('/:id', async (req, res) => {
  res.json(await service.getAlert(req.user!, alertId(req)));
});

alertsRouter.post('/:id/acknowledge', async (req, res) => {
  res.json(await service.acknowledgeAlert(req.user!, alertId(req), requestContext(req)));
});

alertsRouter.post('/:id/updates', async (req, res) => {
  const { body } = alertUpdateSchema.parse(req.body ?? {});
  res.status(201).json(await service.postUpdate(req.user!, alertId(req), body, requestContext(req)));
});

alertsRouter.post('/:id/resolve', async (req, res) => {
  const { notes } = alertNoteSchema.parse(req.body ?? {});
  res.json(await service.closeAlert(req.user!, alertId(req), 'resolved', notes, requestContext(req)));
});

alertsRouter.post('/:id/cancel', async (req, res) => {
  const { notes } = alertNoteSchema.parse(req.body ?? {});
  res.json(await service.closeAlert(req.user!, alertId(req), 'cancelled', notes, requestContext(req)));
});

alertsRouter.get('/:id/attachments/:aid', async (req, res) => {
  const aid = Number(req.params.aid);
  if (!Number.isSafeInteger(aid) || aid < 1) throw notFound('Attachment not found');
  const file = await service.openAttachment(req.user!, alertId(req), aid, req.query.inline === '1', requestContext(req));
  res.attachment(file.name);
  if (file.inline) res.setHeader('Content-Disposition', String(res.getHeader('Content-Disposition')).replace(/^attachment/, 'inline'));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Repr-Digest', `sha-256=:${Buffer.from(file.sha256, 'hex').toString('base64')}:`);
  res.send(file.data);
});
