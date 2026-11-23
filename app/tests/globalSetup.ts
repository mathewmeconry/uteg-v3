import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import {
  adminDatabaseUrl,
  assertTestDatabase,
  testDatabaseName,
  testDatabaseUrl,
} from './database';

export default async function setup() {
  assertTestDatabase(testDatabaseName);

  const client = new Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      testDatabaseName,
    ]);
    // Names cannot be query parameters. assertTestDatabase only lets word characters through.
    if (!rowCount) await client.query(`CREATE DATABASE "${testDatabaseName}"`);
  } finally {
    await client.end();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
