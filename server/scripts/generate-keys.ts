// Generates the RS256 key pair used to sign access tokens (spec #28, §20).
// Usage: npm run keys [-- --force] [-- --out <dir>]   (default dir: keys/; e.g. --out keys/render for the demo host)
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const outIndex = process.argv.indexOf('--out');
const dir = path.resolve((outIndex > -1 && process.argv[outIndex + 1]) || 'keys');
const privatePath = path.join(dir, 'jwt-private.pem');
const publicPath = path.join(dir, 'jwt-public.pem');

if (existsSync(privatePath) && !process.argv.includes('--force')) {
  console.error(`${privatePath} already exists. Re-run with --force to replace it (this invalidates all sessions).`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(dir, { recursive: true });
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });
console.log(`Wrote ${privatePath} and ${publicPath}`);
