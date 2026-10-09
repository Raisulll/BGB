import { pipeline } from 'node:stream/promises';
import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';
import { requirePermission } from '../../middleware/rbac.js';
import { notFound } from '../../utils/errors.js';
import { requestContext } from '../../utils/requestContext.js';
import * as service from './evidence.service.js';

// §19.4 — /api/v1/incidents/:id/evidence (specs #10, #11, #33)
export const evidenceRouter = Router({ mergeParams: true });
evidenceRouter.use(requireAuth, apiLimiter);

// Files are held in memory (≤ EVIDENCE_MAX_FILE_MB each) so their bytes can be type-checked,
// hashed and scanned before anything reaches storage. Runs only after auth + permission checks.
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // browsers send UTF-8 file names (Bangla etc.); busboy defaults to latin1
  limits: {
    fileSize: env.EVIDENCE_MAX_FILE_MB * 1024 * 1024,
    files: env.EVIDENCE_MAX_FILES_PER_UPLOAD,
    fields: 50,
    fieldSize: 64 * 1024,
  },
}).array('files', env.EVIDENCE_MAX_FILES_PER_UPLOAD);

const ID_PATTERN = /^BIRDS-\d{4}-\d{4,}$/;
function ids(req: Request) {
  const incidentId = String(req.params.id ?? '');
  if (!ID_PATTERN.test(incidentId)) throw notFound('Incident not found');
  const evidenceId = req.params.eid === undefined ? NaN : Number(req.params.eid);
  return { incidentId, evidenceId };
}
function evidenceIds(req: Request) {
  const r = ids(req);
  if (!Number.isSafeInteger(r.evidenceId) || r.evidenceId < 1) throw notFound('Evidence not found');
  return r;
}

// Optional "lastModified" form fields (ISO or epoch ms), one per file in the same order
const lastModifiedList = (raw: unknown): (string | null)[] =>
  ([] as unknown[]).concat(raw ?? []).map((v) => {
    const n = Number(v);
    const d = Number.isFinite(n) && String(v).trim() !== '' ? new Date(n) : new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });

evidenceRouter.post('/', requirePermission('create'), upload, async (req, res) => {
  const { incidentId } = ids(req);
  const files = (req.files ?? []) as service.UploadedFile[];
  const created = await service.uploadEvidence(req.user!, incidentId, files, lastModifiedList(req.body?.lastModified), requestContext(req));
  res.status(201).json(created);
});

evidenceRouter.get('/', requirePermission('incidents'), async (req, res) => {
  res.json(await service.listEvidence(req.user!, ids(req).incidentId));
});

evidenceRouter.get('/:eid', requirePermission('incidents'), async (req, res) => {
  const { incidentId, evidenceId } = evidenceIds(req);
  const file = await service.openEvidence(req.user!, incidentId, evidenceId, req.query.inline === '1', requestContext(req));

  res.attachment(file.name); // RFC 6266/5987-encoded file name, safe for non-ASCII
  if (file.inline) res.setHeader('Content-Disposition', String(res.getHeader('Content-Disposition')).replace(/^attachment/, 'inline'));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'private, no-store');
  if (file.sha256) res.setHeader('Repr-Digest', `sha-256=:${Buffer.from(file.sha256, 'hex').toString('base64')}:`); // RFC 9530
  try {
    await pipeline(file.stream, res);
  } catch (err) {
    logger.warn('Evidence stream aborted', { incidentId, evidenceId, err: String(err) });
  }
});

evidenceRouter.post('/:eid/verify', requirePermission('incidents'), async (req, res) => {
  const { incidentId, evidenceId } = evidenceIds(req);
  res.json(await service.verifyEvidence(req.user!, incidentId, evidenceId, requestContext(req)));
});

const removeSchema = z.object({ reason: z.string().trim().max(2000).optional() }).strict();

evidenceRouter.delete('/:eid', requirePermission('incidents'), async (req, res) => {
  const { incidentId, evidenceId } = evidenceIds(req);
  const { reason } = removeSchema.parse(req.body ?? {});
  await service.removeEvidence(req.user!, incidentId, evidenceId, reason || undefined, requestContext(req));
  res.status(204).end();
});
