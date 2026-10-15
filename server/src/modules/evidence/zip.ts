import { inflateRawSync } from 'node:zlib';

// Minimal read-only ZIP reader for evidence checks: lists entry names from the central directory and
// reads one small entry. Office Open XML (.docx/.xlsx/.pptx) and OpenDocument files are ZIP packages.

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const MAX_ENTRIES = 5_000;

/** Central-directory entries, or null if the buffer is not a well-formed ZIP. */
export function zipEntries(buf: Buffer): Entry[] | null {
  // End of central directory: 22 bytes + up to 64 KB comment, at the end of the file
  const stop = Math.max(0, buf.length - 22 - 65_535);
  let eocd = -1;
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || p >= buf.length) return null;

  const entries: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Text of one entry (stored or deflated, at most `maxBytes`), or null. */
export function readZipText(buf: Buffer, entries: Entry[], name: string, maxBytes = 1_000_000): string | null {
  const e = entries.find((x) => x.name === name);
  if (!e || e.size > maxBytes || e.localOffset + 30 > buf.length || buf.readUInt32LE(e.localOffset) !== 0x04034b50) return null;
  const start = e.localOffset + 30 + buf.readUInt16LE(e.localOffset + 26) + buf.readUInt16LE(e.localOffset + 28);
  const data = buf.subarray(start, start + e.compressedSize);
  try {
    if (e.method === 0) return data.toString('utf8');
    if (e.method === 8) return inflateRawSync(data, { maxOutputLength: maxBytes }).toString('utf8');
  } catch {
    return null;
  }
  return null;
}
