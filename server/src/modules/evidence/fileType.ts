// §20 — the MIME whitelist is enforced on the file's actual bytes ("magic numbers"), never on the
// browser-supplied Content-Type or the file extension, which an attacker controls.
export const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;

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
  return null;
}
