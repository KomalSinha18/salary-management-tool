import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import path from 'node:path';
import * as schema from '@/lib/db/schema';
import { runMigrations } from '@/lib/db/migrations-runner';

export type TestDb = {
  db: LibSQLDatabase<typeof schema>;
  client: Client;
  close: () => void;
};

/**
 * Creates a fresh in-memory libSQL database with the full schema
 * (Drizzle migrations + FTS5) applied. Each call returns an isolated
 * database — tests do not share state. Call `close()` in afterEach
 * to release the underlying client.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = createClient({ url: 'file::memory:?cache=shared' });
  const db = drizzle(client, { schema });

  const migrationsFolder = path.resolve(__dirname, '..', '..', 'drizzle');
  await runMigrations(db, client, { migrationsFolder });

  return {
    db,
    client,
    close: () => client.close(),
  };
}
