import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as schema from '@/lib/db/schema';
import { runMigrations } from '@/lib/db/migrations-runner';

export type TestDb = {
  db: LibSQLDatabase<typeof schema>;
  client: Client;
  close: () => void;
};

/**
 * Creates an isolated libSQL database with the full schema applied
 * (Drizzle migrations + FTS5) in an OS-managed temp directory. Each
 * call returns a private database — tests do not share state. Call
 * `close()` in afterEach to release the client and delete the file.
 *
 * Implementation note: we use a real file (in tmpdir()) rather than
 * `:memory:` because drizzle's libsql transaction wrapper opens a
 * second connection for the transaction body. With anonymous
 * `:memory:` that second connection sees an empty database and the
 * transaction fails with "no such table". @libsql/client does not
 * support named in-memory DBs (rejects ?mode=memory), so file URLs
 * are the only path. The performance cost is negligible (<10ms per
 * test) and the OS reaps tmpdir contents on reboot if cleanup is
 * skipped.
 */
export async function createTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(path.join(tmpdir(), 'salary-mgmt-test-'));
  const dbPath = path.join(dir, 'test.db');
  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client, { schema });

  const migrationsFolder = path.resolve(__dirname, '..', '..', 'drizzle');
  await runMigrations(db, client, { migrationsFolder });

  return {
    db,
    client,
    close: () => {
      client.close();
      // On Windows the SQLite file handle is not always released
      // synchronously with client.close(); swallowing EBUSY here is
      // safe because the OS will reap tmpdir contents on its own.
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore — OS will clean up */
      }
    },
  };
}
