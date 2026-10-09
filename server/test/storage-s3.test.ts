import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { EncryptedStorage, S3Storage, type S3Sender } from '../src/config/storage.js';

// Spec #33 — S3 driver (MinIO / AWS S3 / Supabase Storage), against an in-memory fake bucket.

class FakeBucket implements S3Sender {
  readonly objects = new Map<string, Buffer>();
  readonly calls: string[] = [];

  async send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand) {
    const { Bucket, Key } = command.input;
    this.calls.push(`${command.constructor.name} ${Bucket}/${Key}`);
    if (command instanceof PutObjectCommand) {
      this.objects.set(Key!, Buffer.from(command.input.Body as Buffer));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const data = this.objects.get(Key!);
      if (!data) throw Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
      return { Body: { transformToByteArray: async () => new Uint8Array(data) } };
    }
    this.objects.delete(Key!);
    return {};
  }
}

const KEY = 'incidents/BIRDS-2026-1021/3f1c.pdf';
const encryptionKey = Buffer.alloc(32, 9);

async function collect(stream: AsyncIterable<unknown> | null) {
  if (!stream) return null;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('S3 storage driver (spec #33)', () => {
  it('stores, reads, streams and removes objects in the configured bucket', async () => {
    const bucket = new FakeBucket();
    const s3 = new S3Storage(bucket, 'birds-evidence');
    const data = Buffer.from('%PDF-1.4 statement');

    await s3.put(KEY, data);
    expect(bucket.calls[0]).toBe(`PutObjectCommand birds-evidence/${KEY}`);
    expect(await s3.read(KEY)).toEqual(data);
    expect(await collect(await s3.get(KEY))).toEqual(data);

    await s3.remove(KEY);
    expect(await s3.read(KEY)).toBeNull();
    expect(await s3.get(KEY)).toBeNull();
  });

  it('rethrows errors other than "not found"', async () => {
    const failing: S3Sender = { send: async () => Promise.reject(Object.assign(new Error('Access Denied'), { name: 'AccessDenied' })) };
    await expect(new S3Storage(failing, 'b').read(KEY)).rejects.toThrow('Access Denied');
  });

  it('refuses unsafe keys', async () => {
    const s3 = new S3Storage(new FakeBucket(), 'b');
    await expect(s3.put('../escape', Buffer.from('x'))).rejects.toThrow('Invalid storage key');
    await expect(s3.read('/absolute')).rejects.toThrow('Invalid storage key');
  });

  it('holds only ciphertext when wrapped by EncryptedStorage, and detects tampering (spec #27)', async () => {
    const bucket = new FakeBucket();
    const store = new EncryptedStorage(new S3Storage(bucket, 'b'), encryptionKey);
    const data = Buffer.from('%PDF-1.4 statement');

    await store.put(KEY, data);
    const stored = bucket.objects.get(KEY)!;
    expect(stored.subarray(0, 8).toString()).toBe('BIRDSEV1');
    expect(stored.includes(Buffer.from('%PDF'))).toBe(false);
    expect(await store.read(KEY)).toEqual(data);

    // Copied onto another record's key: the key is authenticated, so it fails
    bucket.objects.set('incidents/BIRDS-2026-1022/other.pdf', stored);
    await expect(store.read('incidents/BIRDS-2026-1022/other.pdf')).rejects.toThrow();

    // One altered byte
    const altered = Buffer.from(stored);
    altered[altered.length - 1] = altered.at(-1)! ^ 0xff;
    bucket.objects.set(KEY, altered);
    await expect(store.read(KEY)).rejects.toThrow();
  });
});
