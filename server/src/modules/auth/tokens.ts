import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

// Spec #28 — RS256 access tokens (§20). Keys are created with `npm run keys`.
function readKey(file: string) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new Error(`JWT key not found at ${file}. Run "npm run keys" in server/ first.`);
  }
}

const privateKey = readKey(env.JWT_PRIVATE_KEY_PATH);
const publicKey = readKey(env.JWT_PUBLIC_KEY_PATH);

export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session (refresh_tokens.id) — lets logout/lockout revoke access immediately
  role: string;
}

export const ACCESS_TOKEN_TTL_SEC = env.ACCESS_TOKEN_TTL_MIN * 60;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ sid: payload.sid, role: payload.role }, privateKey, {
    algorithm: 'RS256',
    subject: payload.sub,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'], // pinned: never accept "none" or HS256 with the public key
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sid !== 'string' || typeof decoded.role !== 'string') {
    throw new Error('Malformed token payload');
  }
  return { sub: decoded.sub, sid: decoded.sid, role: decoded.role };
}

// Refresh tokens are opaque random strings; only their SHA-256 is stored.
export const newRefreshToken = () => randomBytes(48).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
