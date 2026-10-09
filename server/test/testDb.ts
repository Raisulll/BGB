import 'dotenv/config';

// Tests run against a separate database named "<dev db>_test" on the same cluster,
// recreated from migrations + seed before every run. It is never the dev database.
export function testDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error('DATABASE_URL is not set (server/.env)');
  const url = new URL(devUrl);
  const devName = url.pathname.replace(/^\//, '');
  url.pathname = `/${devName}_test`;
  return url.toString();
}

export function databaseName(url: string) {
  return new URL(url).pathname.replace(/^\//, '');
}
