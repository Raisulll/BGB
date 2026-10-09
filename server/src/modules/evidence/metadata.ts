import { createHash } from 'node:crypto';
import exifr from 'exifr';
import { logger } from '../../config/logger.js';
import type { AllowedMime } from './fileType.js';

// Spec #11 — preserve the media metadata that matters for evidence: who/what captured it,
// when, and where. Stored in evidence.file_metadata (JSONB) next to a SHA-256 of the bytes.

export const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

// EXIF fields worth keeping; full dumps are noisy and can include large binary blobs
const EXIF_FIELDS = [
  'Make', 'Model', 'LensModel', 'Software', 'DateTimeOriginal', 'CreateDate', 'ModifyDate',
  'OffsetTimeOriginal', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'ImageWidth', 'ImageHeight',
  'ExifImageWidth', 'ExifImageHeight', 'Orientation', 'Artist', 'Copyright', 'GPSAltitude', 'GPSDateStamp',
] as const;

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.replace(/\0/g, '').trim().slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 16).map(jsonSafe);
  if (value && typeof value === 'object') return null; // nested objects / binary blobs are dropped
  return value;
}

export interface EvidenceMetadata {
  detectedMime: AllowedMime;
  declaredMime: string | null;
  clientLastModified: string | null;
  exif?: Record<string, unknown>;
  gps?: { latitude: number; longitude: number };
  extractionError?: string;
}

export async function extractMetadata(
  buf: Buffer,
  detectedMime: AllowedMime,
  declaredMime: string | null,
  clientLastModified: string | null,
): Promise<EvidenceMetadata> {
  const meta: EvidenceMetadata = { detectedMime, declaredMime, clientLastModified };
  if (detectedMime !== 'image/jpeg' && detectedMime !== 'image/png') return meta;

  try {
    const parsed = await exifr.parse(buf, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false });
    if (parsed) {
      const exif: Record<string, unknown> = {};
      for (const key of EXIF_FIELDS) {
        if (parsed[key] !== undefined) {
          const v = jsonSafe(parsed[key]);
          if (v !== null && v !== undefined) exif[key] = v;
        }
      }
      if (Object.keys(exif).length) meta.exif = exif;
      if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
        meta.gps = { latitude: parsed.latitude, longitude: parsed.longitude };
      }
    }
  } catch (err) {
    // Corrupt or unusual EXIF must not block an evidence upload; record that extraction failed
    meta.extractionError = 'Metadata could not be read';
    logger.warn('EXIF extraction failed', { err: String(err) });
  }
  return meta;
}
