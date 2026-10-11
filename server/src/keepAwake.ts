import { env } from './config/env.js';
import { logger } from './config/logger.js';

// Demo hosting on Render's free plan (DOUBT-010): an idle service is stopped after 15 minutes
// without incoming requests, and a stopped service can't ring anyone or deliver pushes. With
// KEEP_AWAKE_MINUTES set, the server requests its own public health URL that often; the request
// goes out and back in through Render's front door, so it counts as traffic. Off by default (0):
// production servers don't sleep.
let timer: NodeJS.Timeout | null = null;

export function startKeepAwake() {
  if (!env.KEEP_AWAKE_MINUTES) return;
  const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/api/v1/health`;
  const ping = async () => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'birds-keep-awake' }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) logger.warn('Keep-awake ping got an error status', { url, status: res.status });
    } catch (err) {
      logger.warn('Keep-awake ping failed', { url, err: String(err) });
    }
  };
  timer = setInterval(ping, env.KEEP_AWAKE_MINUTES * 60_000);
  logger.info(`Keep-awake: pinging ${url} every ${env.KEEP_AWAKE_MINUTES} min`);
}

export function stopKeepAwake() {
  if (timer) clearInterval(timer);
  timer = null;
}
