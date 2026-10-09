import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/testDb.js';

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
    },
    // One shared database: run files one at a time
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
