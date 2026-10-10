import 'dotenv/config';
import { z } from 'zod';

// Typed, validated environment (§16.2). The process refuses to start on bad config.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(9),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Express "trust proxy": a hop count (e.g. 1 behind one load balancer such as Render's),
  // true/false, or proxy addresses/subnets (e.g. loopback, 10.0.0.0/8)
  TRUST_PROXY: z
    .string()
    .default('loopback')
    .transform((v): boolean | number | string => (/^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v)),

  // Spec #2 / #56 — folder of the built SPA (BGB/dist) to serve from this process (single-service
  // hosting, e.g. the Render demo). Unset when Nginx serves the SPA (§15).
  SERVE_SPA_DIR: z.string().optional(),

  JWT_PRIVATE_KEY_PATH: z.string().default('keys/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('keys/jwt-public.pem'),
  JWT_ISSUER: z.string().default('birds-api'),
  JWT_AUDIENCE: z.string().default('birds-web'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(8),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  // §20: 100 requests per minute per signed-in user. Raise only for development/test tooling.
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(100),

  // Evidence storage (specs #10, #33). "local" writes under EVIDENCE_DIR; "s3" uses any
  // S3-compatible store (MinIO, AWS S3, Supabase Storage) — see src/config/storage.ts.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  EVIDENCE_DIR: z.string().default('storage/evidence'),
  S3_ENDPOINT: z.string().url().optional(), // unset = AWS S3
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Path-style URLs (endpoint/bucket/key): needed by MinIO and Supabase Storage
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  EVIDENCE_MAX_FILE_MB: z.coerce.number().positive().default(50),
  EVIDENCE_MAX_INCIDENT_MB: z.coerce.number().positive().default(500),
  EVIDENCE_MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(10),
  // Spec #27 — AES-256-GCM encryption of stored evidence: 32 random bytes, base64
  // (`npm run keys:evidence`). Required in production. Losing it makes stored evidence unreadable.
  EVIDENCE_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((k) => !k || Buffer.from(k, 'base64').length === 32, 'EVIDENCE_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),

  // Spec #23 — workflow e-mail. MAIL_TRANSPORT "smtp" needs SMTP_HOST; "json" renders messages
  // without sending (tests); "none" disables e-mail. Default: smtp if SMTP_HOST is set, else none.
  MAIL_TRANSPORT: z.enum(['smtp', 'json', 'none']).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'), // true = implicit TLS (465)
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('BIRDS <birds-noreply@bgb.gov.bd>'),
  // Links in e-mails point here (the SPA origin)
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),

  // Specs #31, #52 — OpenAPI document (/api/v1/openapi.json) + Swagger UI (/api/docs).
  // Default: on except in production, where the route map is published only when chosen (e.g. TEC demo).
  API_DOCS: z.enum(['true', 'false']).optional(),

  // Audio calls (WebRTC): ICE servers handed to browsers. STUN finds the public address; TURN relays
  // audio when a direct path is blocked (strict firewalls, some mobile networks). Comma-separated.
  // Production: BGB's own coturn server, so call audio never passes through a third party.
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  // How long an incoming call rings before it counts as missed
  CALL_RING_SECONDS: z.coerce.number().int().min(1).max(120).default(30),
  // How long a call waits for a participant whose realtime connection dropped (network blip, phone
  // screen lock) to reconnect before it ends as "connection lost". The audio keeps flowing meanwhile
  CALL_RECONNECT_SECONDS: z.coerce.number().int().min(1).max(120).default(30),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
});

const parsed = schema
  .refine((e) => e.STORAGE_DRIVER !== 's3' || (!!e.S3_BUCKET && !!e.S3_ACCESS_KEY_ID && !!e.S3_SECRET_ACCESS_KEY), {
    message: 'STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    path: ['STORAGE_DRIVER'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.EVIDENCE_ENCRYPTION_KEY, {
    message: 'EVIDENCE_ENCRYPTION_KEY is required in production (evidence must be encrypted at rest, spec #27)',
    path: ['EVIDENCE_ENCRYPTION_KEY'],
  })
  .safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  MAIL_TRANSPORT: parsed.data.MAIL_TRANSPORT ?? (parsed.data.SMTP_HOST ? 'smtp' : 'none'),
  API_DOCS: parsed.data.API_DOCS ? parsed.data.API_DOCS === 'true' : parsed.data.NODE_ENV !== 'production',
};
export const isProduction = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
