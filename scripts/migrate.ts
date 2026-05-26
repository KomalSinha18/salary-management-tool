import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { runMigrations } from '../src/lib/db/migrations-runner';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }

  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const db = drizzle(client);

  console.warn(`Running migrations against ${url} ...`);
  await runMigrations(db, client);
  console.warn('Migrations complete.');

  client.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
