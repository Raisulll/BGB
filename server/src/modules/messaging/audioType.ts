// Voice notes: the audio type is decided from the file's bytes, never the browser's Content-Type.
// Browsers record WebM/Opus (Chrome, Edge, Firefox), Ogg/Opus (Firefox) or MP4/AAC (Safari).
export const AUDIO_TYPES = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
} as const;
export type AudioMime = keyof typeof AUDIO_TYPES;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export function detectAudio(buf: Buffer): AudioMime | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm'; // EBML (WebM/Matroska)
  if (startsWith(buf, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg'; // "OggS"
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) return 'audio/mp4'; // ....ftyp
  if (startsWith(buf, [0x49, 0x44, 0x33]) || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) return 'audio/mpeg'; // ID3 / MPEG frame
  return null;
}
