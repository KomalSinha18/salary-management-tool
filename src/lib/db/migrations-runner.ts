import { migrate } from 'drizzle-orm/libsql/migrator';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import path from 'node:path';
import { EMPLOYEES_FTS_STATEMENTS } from './fts';

/**
 * Applies all schema migrations followed by the FTS5 virtual-table
 * setup. Used by both the prod migrate script (scripts/migrate.ts)
 * and the integration-test helper (tests/helpers/test-db.ts) so the
 * code path under test is identical to the one that ships.
 *
 * The FTS5 statements must run AFTER the employees table exists,
 * which is why they are not in drizzle/0000_initial_schema.sql.
 */
export async function runMigrations(
  db: LibSQLDatabase<Record<string, unknown>>,
  client: Client,
  options: { migrationsFolder?: string } = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? path.resolve(process.cwd(), 'drizzle');

  await migrate(db, { migrationsFolder });

  for (const statement of EMPLOYEES_FTS_STATEMENTS) {
    await client.execute(statement);
  }
}
