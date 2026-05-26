import { and, eq } from 'drizzle-orm';
import { SalaryRepository } from '@/lib/repositories/salary-repo';
import { salaries } from '@/lib/db/schema';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { resetFactoryCounters, seedEmployee, seedSalary } from '../helpers/factories';

describe('SalaryRepository', () => {
  let test: TestDb;
  let repo: SalaryRepository;

  beforeEach(async () => {
    test = await createTestDb();
    repo = new SalaryRepository(test.db, test.client);
    resetFactoryCounters();
  });

  afterEach(() => {
    test.close();
  });

  describe('findCurrent', () => {
    it('returns null when the employee has no salary rows', async () => {
      const employee = await seedEmployee(test);
      const current = await repo.findCurrent(employee.id);
      expect(current).toBeNull();
    });

    it('returns the row with effective_to IS NULL', async () => {
      const employee = await seedEmployee(test);
      await seedSalary(test, employee.id, {
        baseSalary: 9_000_000,
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-07-01',
        reason: 'hire',
      });
      await seedSalary(test, employee.id, {
        baseSalary: 10_500_000,
        effectiveFrom: '2024-07-01',
        effectiveTo: null,
        reason: 'raise',
      });

      const current = await repo.findCurrent(employee.id);
      expect(current?.baseSalary).toBe(10_500_000);
      expect(current?.effectiveTo).toBeNull();
    });

    it('does not return a closed row even when only one row exists', async () => {
      const employee = await seedEmployee(test);
      await seedSalary(test, employee.id, {
        effectiveFrom: '2023-01-01',
        effectiveTo: '2024-01-01',
      });

      const current = await repo.findCurrent(employee.id);
      expect(current).toBeNull();
    });
  });

  describe('findHistory', () => {
    it('returns rows ordered by effective_from descending (newest first)', async () => {
      const employee = await seedEmployee(test);
      await seedSalary(test, employee.id, {
        effectiveFrom: '2023-01-01',
        effectiveTo: '2024-01-01',
        baseSalary: 8_000_000,
      });
      await seedSalary(test, employee.id, {
        effectiveFrom: '2024-01-01',
        effectiveTo: '2025-01-01',
        baseSalary: 9_000_000,
      });
      await seedSalary(test, employee.id, {
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
        baseSalary: 10_000_000,
      });

      const history = await repo.findHistory(employee.id);
      expect(history.map((row) => row.baseSalary)).toEqual([10_000_000, 9_000_000, 8_000_000]);
    });

    it('returns an empty array when the employee has no salary rows', async () => {
      const employee = await seedEmployee(test);
      const history = await repo.findHistory(employee.id);
      expect(history).toEqual([]);
    });
  });

  describe('findCurrentForEmployees', () => {
    it('returns a map of employee id to current salary, omitting those with no current row', async () => {
      const a = await seedEmployee(test);
      const b = await seedEmployee(test);
      const c = await seedEmployee(test);

      await seedSalary(test, a.id, { baseSalary: 5_000_000 });
      await seedSalary(test, b.id, { baseSalary: 7_500_000 });
      await seedSalary(test, c.id, {
        baseSalary: 6_000_000,
        effectiveTo: '2024-12-31',
      });

      const result = await repo.findCurrentForEmployees([a.id, b.id, c.id]);
      expect(result.get(a.id)?.baseSalary).toBe(5_000_000);
      expect(result.get(b.id)?.baseSalary).toBe(7_500_000);
      expect(result.has(c.id)).toBe(false);
    });

    it('returns an empty map for an empty input', async () => {
      const result = await repo.findCurrentForEmployees([]);
      expect(result.size).toBe(0);
    });
  });

  describe('recordInitial', () => {
    it('inserts a row with effective_to null and returns it', async () => {
      const employee = await seedEmployee(test);

      const created = await repo.recordInitial({
        employeeId: employee.id,
        baseSalary: 12_000_000,
        effectiveFrom: '2026-02-01',
        reason: 'hire',
      });

      expect(created.id).toEqual(expect.any(Number));
      expect(created.baseSalary).toBe(12_000_000);
      expect(created.effectiveTo).toBeNull();
      expect(created.currency).toBe('USD');
    });

    it('honours an explicit currency', async () => {
      const employee = await seedEmployee(test);
      const created = await repo.recordInitial({
        employeeId: employee.id,
        baseSalary: 50_00_000,
        currency: 'INR',
        effectiveFrom: '2026-02-01',
        reason: 'hire',
      });
      expect(created.currency).toBe('INR');
    });
  });

  describe('supersede', () => {
    it('closes the current row at the new effective date and inserts the new row', async () => {
      const employee = await seedEmployee(test);
      const initial = await seedSalary(test, employee.id, {
        baseSalary: 9_000_000,
        effectiveFrom: '2024-01-01',
        effectiveTo: null,
        reason: 'hire',
      });

      const result = await repo.supersede({
        employeeId: employee.id,
        baseSalary: 11_000_000,
        effectiveFrom: '2025-07-01',
        reason: 'raise',
      });

      expect(result.closed.id).toBe(initial.id);
      expect(result.closed.effectiveTo).toBe('2025-07-01');
      expect(result.created.baseSalary).toBe(11_000_000);
      expect(result.created.effectiveTo).toBeNull();

      const current = await repo.findCurrent(employee.id);
      expect(current?.id).toBe(result.created.id);

      const history = await repo.findHistory(employee.id);
      expect(history).toHaveLength(2);
    });

    it('throws when there is no current row to supersede', async () => {
      const employee = await seedEmployee(test);
      await expect(
        repo.supersede({
          employeeId: employee.id,
          baseSalary: 9_000_000,
          effectiveFrom: '2025-01-01',
          reason: 'raise',
        }),
      ).rejects.toThrow();
    });

    it('does not leave the previous row open if the new insert fails', async () => {
      const employee = await seedEmployee(test);
      await seedSalary(test, employee.id, {
        baseSalary: 9_000_000,
        effectiveFrom: '2024-01-01',
        effectiveTo: null,
      });

      await expect(
        repo.supersede({
          employeeId: employee.id,
          baseSalary: -1,
          effectiveFrom: 'not-a-date-but-the-fk-or-validation-fails-elsewhere',
          reason: 'raise',
        }),
      ).rejects.toThrow();

      const rows = await test.db
        .select()
        .from(salaries)
        .where(and(eq(salaries.employeeId, employee.id)));
      const openRows = rows.filter((row) => row.effectiveTo === null);
      expect(openRows).toHaveLength(1);
      expect(openRows[0]?.baseSalary).toBe(9_000_000);
    });
  });
});
