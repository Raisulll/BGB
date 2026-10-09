import { mkdirSync } from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import { env, isProduction } from './env.js';

// Spec #48 — structured application logging (§25).
// TODO(Phase 5): switch file transports to winston-daily-rotate-file with 90-day retention.
mkdirSync(env.LOG_DIR, { recursive: true });

const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json());

const consoleFormat = isProduction
  ? fileFormat
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level} ${stack ?? message}${extra}`;
      }),
    );

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: path.join(env.LOG_DIR, 'error.log'), level: 'error', format: fileFormat }),
    new winston.transports.File({ filename: path.join(env.LOG_DIR, 'app.log'), format: fileFormat }),
  ],
});

// Dedicated stream for failed logins, lockouts, permission denials, token reuse (§25).
export const securityLogger = winston.createLogger({
  level: 'info',
  format: fileFormat,
  defaultMeta: { stream: 'security' },
  transports: [
    new winston.transports.File({ filename: path.join(env.LOG_DIR, 'security.log') }),
    new winston.transports.Console({ format: consoleFormat, level: 'warn' }),
  ],
});
