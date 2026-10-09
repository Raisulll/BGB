import { prisma } from '../../db.js';

// system_config defaults (§17.11). Seeded into the DB; these values are also the fallback
// if a row is missing, so the API never runs without a policy. `type`/`min`/`max` validate
// edits made through PATCH /admin/config (spec #47).
export interface ConfigSpec {
  value: string;
  description: string;
  type: 'int' | 'bool';
  min?: number;
  max?: number;
}

export const CONFIG_DEFAULTS: Record<string, ConfigSpec> = {
  'password.min_length': { value: '8', description: 'Minimum password length', type: 'int', min: 8, max: 64 },
  'password.require_uppercase': { value: 'true', description: 'Require at least one uppercase letter', type: 'bool' },
  'password.require_number': { value: 'true', description: 'Require at least one digit', type: 'bool' },
  'password.require_special': { value: 'true', description: 'Require at least one special character', type: 'bool' },
  'password.max_attempts': { value: '5', description: 'Failed login threshold before lockout', type: 'int', min: 3, max: 20 },
  'password.lockout_minutes': { value: '15', description: 'Account lockout duration (minutes)', type: 'int', min: 1, max: 1440 },
  'session.timeout_minutes': { value: '30', description: 'Idle session timeout (minutes)', type: 'int', min: 5, max: 480 },
  'session.single_session': { value: 'true', description: 'A new login ends the user\'s other sessions', type: 'bool' },
  'data.retention_days': { value: '3650', description: '10-year retention policy', type: 'int', min: 365, max: 36500 },
  'archive.after_days': { value: '365', description: 'Archive Closed/Rejected incidents not updated for this many days', type: 'int', min: 30, max: 3650 },
  'backup.frequency_hours': { value: '24', description: 'Automated backup interval (hours)', type: 'int', min: 1, max: 168 },
  // Incident reference counters are per year: 'incident.next_id.<YYYY>' (created on first use; see
  // allocateIncidentId). They are read-only through the API.
};

/** Returns the normalised value, or an error message if `raw` is not valid for `key`. */
export function validateConfigValue(key: string, raw: unknown): { value: string } | { error: string } {
  const spec = CONFIG_DEFAULTS[key];
  if (!spec) return { error: `${key} is not an editable setting` };
  if (spec.type === 'bool') {
    if (raw === true || raw === 'true') return { value: 'true' };
    if (raw === false || raw === 'false') return { value: 'false' };
    return { error: `${key} must be true or false` };
  }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isInteger(n)) return { error: `${key} must be a whole number` };
  if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
    return { error: `${key} must be between ${spec.min} and ${spec.max}` };
  }
  return { value: String(n) };
}

export interface SecurityConfig {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  maxAttempts: number;
  lockoutMinutes: number;
  sessionTimeoutMinutes: number;
  singleSession: boolean;
}

// Short cache: config changes take effect within CACHE_MS on every PM2 worker.
const CACHE_MS = 30_000;
let cache: { at: number; value: SecurityConfig } | null = null;

export function invalidateConfigCache() {
  cache = null;
}

export async function getSecurityConfig(): Promise<SecurityConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const rows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: 'password.' } },
  });
  const sessionRows = await prisma.systemConfig.findMany({ where: { key: { startsWith: 'session.' } } });
  const map = new Map([...rows, ...sessionRows].map((r) => [r.key, r.value]));
  const get = (key: string) => map.get(key) ?? CONFIG_DEFAULTS[key]!.value;
  const num = (key: string) => {
    const n = Number(get(key));
    return Number.isFinite(n) ? n : Number(CONFIG_DEFAULTS[key]!.value);
  };
  const bool = (key: string) => get(key) === 'true';

  const value: SecurityConfig = {
    minLength: num('password.min_length'),
    requireUppercase: bool('password.require_uppercase'),
    requireNumber: bool('password.require_number'),
    requireSpecial: bool('password.require_special'),
    maxAttempts: num('password.max_attempts'),
    lockoutMinutes: num('password.lockout_minutes'),
    sessionTimeoutMinutes: num('session.timeout_minutes'),
    singleSession: bool('session.single_session'),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Spec #29 — returns an error message, or null if the password satisfies the policy. */
export function validatePassword(pwd: string, policy: SecurityConfig): string | null {
  if (pwd.length < policy.minLength) return `Password must be at least ${policy.minLength} characters`;
  if (pwd.length > 128) return 'Password must be at most 128 characters';
  if (policy.requireUppercase && !/[A-Z]/.test(pwd)) return 'Password must include an uppercase letter';
  if (policy.requireNumber && !/[0-9]/.test(pwd)) return 'Password must include a number';
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(pwd)) return 'Password must include a special character';
  return null;
}
