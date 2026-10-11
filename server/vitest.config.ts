import webpush from 'web-push';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/testDb.js';

// A throwaway VAPID pair per test run (push is on; test/push.test.ts replaces the sender)
const vapid = webpush.generateVAPIDKeys();

export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      BCRYPT_ROUNDS: '10',
      LOG_LEVEL: 'error',
      LOG_DIR: 'logs/test',
      EVIDENCE_DIR: 'storage/test-evidence',
      EVIDENCE_MAX_FILE_MB: '1', // small cap so the size-limit test stays fast
      MAIL_TRANSPORT: 'json', // render e-mails without sending
      EVIDENCE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), // fixed test key (spec #27)
      SMTP_HOST: '',
      CALL_RING_SECONDS: '1', // missed-call test
      CALL_RECONNECT_SECONDS: '1', // dropped-connection test
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
    },
    // One shared database: run files one at a time
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
