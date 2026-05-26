import { sql } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { departments, employees, roles } from '@/lib/db/schema';
import { EMPLOYEES_FTS_TABLE } from '@/lib/db/fts';

describe('migrations-runner', () => {
  let test: TestDb;

  beforeEach(async () => {
    test = await createTestDb();
  });

  afterEach(() => {
    test.close();
  });

  it('creates all five core tables', async () => {
    const result = await test.client.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`,
    );
    const names = result.rows.map((row) => row['name']);

    expect(names).toEqual(
      expect.arrayContaining([
        'audit_log',
        'departments',
        'employees',
        'roles',
        'salaries',
        EMPLOYEES_FTS_TABLE,
      ]),
    );
  });

  it('creates the FTS5 virtual table and its three sync triggers', async () => {
    const tables = await test.client.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?`,
      [EMPLOYEES_FTS_TABLE],
    );
    expect(tables.rows).toHaveLength(1);

    const triggers = await test.client.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'employees_fts_%' ORDER BY name`,
    );
    expect(triggers.rows.map((row) => row['name'])).toEqual([
      'employees_fts_ad',
      'employees_fts_ai',
      'employees_fts_au',
    ]);
  });

  it('indexes inserted employees in FTS5 so they are findable by MATCH', async () => {
    const [dept] = await test.db
      .insert(departments)
      .values({ name: 'Engineering' })
      .returning({ id: departments.id });
    const [role] = await test.db
      .insert(roles)
      .values({ title: 'Software Engineer' })
      .returning({ id: roles.id });

    if (!dept || !role) {
      throw new Error('Failed to seed department/role for FTS test');
    }

    await test.db.insert(employees).values({
      employeeCode: 'EMP-0001',
      firstName: 'Priya',
      lastName: 'Khanna',
      email: 'priya.khanna@example.com',
      departmentId: dept.id,
      roleId: role.id,
      hireDate: '2024-01-15',
      employmentType: 'full_time',
    });

    const hits = await test.client.execute({
      sql: `SELECT employee_code FROM ${EMPLOYEES_FTS_TABLE} WHERE ${EMPLOYEES_FTS_TABLE} MATCH ?`,
      args: ['khanna'],
    });

    expect(hits.rows).toHaveLength(1);
    expect(hits.rows[0]?.['employee_code']).toBe('EMP-0001');
  });

  it('removes deleted employees from the FTS5 index', async () => {
    const [dept] = await test.db
      .insert(departments)
      .values({ name: 'Sales' })
      .returning({ id: departments.id });
    const [role] = await test.db
      .insert(roles)
      .values({ title: 'Account Executive' })
      .returning({ id: roles.id });
    if (!dept || !role) throw new Error('seed failed');

    const [inserted] = await test.db
      .insert(employees)
      .values({
        employeeCode: 'EMP-0002',
        firstName: 'Devon',
        lastName: 'Marsh',
        email: 'devon@example.com',
        departmentId: dept.id,
        roleId: role.id,
        hireDate: '2023-06-01',
        employmentType: 'full_time',
      })
      .returning({ id: employees.id });
    if (!inserted) throw new Error('insert failed');

    await test.db.delete(employees).where(sql`${employees.id} = ${inserted.id}`);

    const hits = await test.client.execute({
      sql: `SELECT employee_code FROM ${EMPLOYEES_FTS_TABLE} WHERE ${EMPLOYEES_FTS_TABLE} MATCH ?`,
      args: ['marsh'],
    });

    expect(hits.rows).toHaveLength(0);
  });
});
