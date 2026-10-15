import { createHash } from 'node:crypto';
import exifr from 'exifr';
import { logger } from '../../config/logger.js';
import { isOfficeDocument, type AllowedMime } from './fileType.js';
import { readZipText, zipEntries } from './zip.js';

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
  // Office/OpenDocument properties: title, author, last modified by, created, modified
  document?: Record<string, string>;
  gps?: { latitude: number; longitude: number };
  extractionError?: string;
}

// Spec #11 — the document's own properties (docProps/core.xml or OpenDocument meta.xml)
const DOC_FIELDS: [string, string[]][] = [
  ['title', ['dc:title']],
  ['author', ['dc:creator', 'meta:initial-creator']],
  ['lastModifiedBy', ['cp:lastModifiedBy']],
  ['created', ['dcterms:created', 'meta:creation-date']],
  ['modified', ['dcterms:modified', 'dc:date']],
];

const xmlText = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim().slice(0, 300);

function documentProperties(buf: Buffer): Record<string, string> | null {
  const entries = zipEntries(buf);
  if (!entries) return null; // legacy binary formats: file name, size, dates and fingerprint only
  const xml = readZipText(buf, entries, 'docProps/core.xml') ?? readZipText(buf, entries, 'meta.xml');
  if (!xml) return null;
  const props: Record<string, string> = {};
  for (const [key, tags] of DOC_FIELDS) {
    for (const tag of tags) {
      const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
      if (m?.[1]?.trim()) {
        props[key] = xmlText(m[1]);
        break;
      }
    }
  }
  return Object.keys(props).length ? props : null;
}

export async function extractMetadata(
  buf: Buffer,
  detectedMime: AllowedMime,
  declaredMime: string | null,
  clientLastModified: string | null,
): Promise<EvidenceMetadata> {
  const meta: EvidenceMetadata = { detectedMime, declaredMime, clientLastModified };
  if (isOfficeDocument(detectedMime)) {
    const document = documentProperties(buf);
    if (document) meta.document = document;
    return meta;
  }
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
