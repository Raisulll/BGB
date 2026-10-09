import morgan from 'morgan';
import { logger } from '../config/logger.js';

// Spec #48 — HTTP access log: method, URL, status, response time, client IP (§25).
// Query strings are dropped so tokens or search terms never land in the logs.
morgan.token('path', (req) => (req as { originalUrl?: string }).originalUrl?.split('?')[0] ?? '');

export const requestLogger = morgan(':remote-addr :method :path :status :res[content-length] - :response-time ms', {
  stream: { write: (line) => logger.http(line.trim()) },
});
