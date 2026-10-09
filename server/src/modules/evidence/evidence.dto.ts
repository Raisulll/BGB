import type { Evidence } from '../../generated/prisma/client.js';

export const toEvidenceDto = (e: Evidence) => ({
  id: e.id,
  name: e.originalName,
  mimeType: e.mimeType,
  size: Number(e.fileSize),
  sha256: e.sha256,
  metadata: e.fileMetadata,
  uploadedBy: e.uploadedBy,
  uploadedAt: e.uploadedAt.toISOString(),
  // Seed rows reference files that were never uploaded
  available: e.sha256 !== null,
  downloadUrl: `/api/v1/incidents/${e.incidentId}/evidence/${e.id}`,
});
