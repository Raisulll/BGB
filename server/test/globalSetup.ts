import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import pg from 'pg';
import { databaseName, testDatabaseUrl } from './testDb.js';

// Recreates the disposable test database, applies migrations and seeds it.
export default async function setup() {
  const testUrl = testDatabaseUrl();
  const name = databaseName(testUrl);
  if (!name.endsWith('_test')) throw new Error(`Refusing to recreate "${name}": test database names must end with _test`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8'`);
  await client.end();

  rmSync('storage/test-evidence', { recursive: true, force: true });

  const env = { ...process.env, DATABASE_URL: testUrl, BCRYPT_ROUNDS: '10', NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });
}
