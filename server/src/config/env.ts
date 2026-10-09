import 'dotenv/config';
import { z } from 'zod';

// Typed, validated environment (§16.2). The process refuses to start on bad config.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(9),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.string().default('loopback'),

  JWT_PRIVATE_KEY_PATH: z.string().default('keys/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('keys/jwt-public.pem'),
  JWT_ISSUER: z.string().default('birds-api'),
  JWT_AUDIENCE: z.string().default('birds-web'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(8),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Evidence storage (specs #10, #33). "local" writes under EVIDENCE_DIR; an S3/MinIO driver
  // plugs into the same interface (src/config/storage.ts).
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  EVIDENCE_DIR: z.string().default('storage/evidence'),
  EVIDENCE_MAX_FILE_MB: z.coerce.number().positive().default(50),
  EVIDENCE_MAX_INCIDENT_MB: z.coerce.number().positive().default(500),
  EVIDENCE_MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
