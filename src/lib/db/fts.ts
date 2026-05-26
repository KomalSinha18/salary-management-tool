/**
 * FTS5 virtual table for employee search.
 *
 * Drizzle has no first-class support for SQLite FTS5 virtual tables,
 * so we hand-write the DDL here and apply it via the migrations
 * runner after the generated Drizzle migrations land the employees
 * table.
 *
 * Design:
 * - `employees_fts` is a contentless FTS5 table (`content='employees'`,
 *   `content_rowid='id'`) so we don't duplicate row data; FTS5 reads
 *   indexed columns straight from `employees` via rowid.
 * - Three triggers keep the index in sync with INSERT/UPDATE/DELETE
 *   on `employees`. The DELETE/UPDATE triggers issue an FTS5 "delete"
 *   command to forget the old indexed terms before reindexing.
 * - `porter unicode61` tokenizer: porter stemming + unicode-aware
 *   normalisation, so "Khanna" and "khanna" match, and "engineering"
 *   matches a query for "engineer".
 */

export const EMPLOYEES_FTS_TABLE = 'employees_fts';

export const EMPLOYEES_FTS_STATEMENTS: readonly string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS ${EMPLOYEES_FTS_TABLE} USING fts5(
    first_name,
    last_name,
    email,
    employee_code,
    content='employees',
    content_rowid='id',
    tokenize='porter unicode61'
  )`,

  `CREATE TRIGGER IF NOT EXISTS employees_fts_ai
   AFTER INSERT ON employees
   BEGIN
     INSERT INTO ${EMPLOYEES_FTS_TABLE}(rowid, first_name, last_name, email, employee_code)
     VALUES (new.id, new.first_name, new.last_name, new.email, new.employee_code);
   END`,

  `CREATE TRIGGER IF NOT EXISTS employees_fts_ad
   AFTER DELETE ON employees
   BEGIN
     INSERT INTO ${EMPLOYEES_FTS_TABLE}(${EMPLOYEES_FTS_TABLE}, rowid, first_name, last_name, email, employee_code)
     VALUES('delete', old.id, old.first_name, old.last_name, old.email, old.employee_code);
   END`,

  `CREATE TRIGGER IF NOT EXISTS employees_fts_au
   AFTER UPDATE ON employees
   BEGIN
     INSERT INTO ${EMPLOYEES_FTS_TABLE}(${EMPLOYEES_FTS_TABLE}, rowid, first_name, last_name, email, employee_code)
     VALUES('delete', old.id, old.first_name, old.last_name, old.email, old.employee_code);
     INSERT INTO ${EMPLOYEES_FTS_TABLE}(rowid, first_name, last_name, email, employee_code)
     VALUES (new.id, new.first_name, new.last_name, new.email, new.employee_code);
   END`,
];
