import { readZipText, zipEntries } from './zip.js';

// §20 — the MIME whitelist is enforced on the file's actual bytes ("magic numbers"), never on the
// browser-supplied Content-Type or the file extension, which an attacker controls.
export const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  // Spec #10 — reports and other documents (macro-enabled files are refused)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/msword': '.doc',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp',
  'application/rtf': '.rtf',
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;

export const isOfficeDocument = (mime: string) => mime.startsWith('application/') && mime !== 'application/pdf';

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, start: number, end: number) => buf.subarray(start, end).toString('latin1');

/** Detects the real type of an upload, or null if it is not on the whitelist. */
export function detectMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(buf, 0, 5) === '%PDF-') return 'application/pdf';
  // ISO base media: bytes 4..8 are "ftyp", followed by the major brand
  if (ascii(buf, 4, 8) === 'ftyp') return ascii(buf, 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (ascii(buf, 0, 5) === '{\\rtf') return 'application/rtf';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return zipDocument(buf);
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return oleDocument(buf);
  return null;
}

// Office Open XML and OpenDocument packages, told apart by their parts; any VBA project is refused
function zipDocument(buf: Buffer): AllowedMime | null {
  const entries = zipEntries(buf);
  if (!entries) return null;
  const names = entries.map((e) => e.name);
  if (names.some((n) => /vbaProject\.bin$|^Basic\/|\/Basic\//i.test(n))) return null;
  if (names.includes('[Content_Types].xml')) {
    if (names.some((n) => n.startsWith('word/'))) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (names.some((n) => n.startsWith('xl/'))) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (names.some((n) => n.startsWith('ppt/'))) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return null;
  }
  const odf = (readZipText(buf, entries, 'mimetype', 200) ?? '').trim();
  return odf === 'application/vnd.oasis.opendocument.text' || odf === 'application/vnd.oasis.opendocument.spreadsheet' || odf === 'application/vnd.oasis.opendocument.presentation'
    ? odf
    : null;
}

// Legacy Office (OLE compound file): the main stream names are UTF-16 in the directory; macros are refused
function oleDocument(buf: Buffer): AllowedMime | null {
  const has = (name: string) => buf.includes(Buffer.from(name, 'utf16le'));
  if (has('_VBA_PROJECT') || has('Macros')) return null;
  if (has('WordDocument')) return 'application/msword';
  if (has('Workbook') || has('Book')) return 'application/vnd.ms-excel';
  if (has('PowerPoint Document')) return 'application/vnd.ms-powerpoint';
  return null;
}
