import { EmployeeRepository } from '@/lib/repositories/employee-repo';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { resetFactoryCounters, seedDepartment, seedEmployee, seedRole } from '../helpers/factories';

describe('EmployeeRepository', () => {
  let test: TestDb;
  let repo: EmployeeRepository;

  beforeEach(async () => {
    test = await createTestDb();
    repo = new EmployeeRepository(test.db, test.client);
    resetFactoryCounters();
  });

  afterEach(() => {
    test.close();
  });

  describe('findPage', () => {
    it('returns empty rows and total 0 when no employees exist', async () => {
      const result = await repo.findPage({ page: 1, pageSize: 50 });
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns the requested page with the total count of matching rows', async () => {
      const dept = await seedDepartment(test, { name: 'Engineering' });
      const role = await seedRole(test, { title: 'Engineer' });
      for (let i = 0; i < 5; i += 1) {
        await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      }

      const page1 = await repo.findPage({ page: 1, pageSize: 3 });
      expect(page1.rows).toHaveLength(3);
      expect(page1.total).toBe(5);

      const page2 = await repo.findPage({ page: 2, pageSize: 3 });
      expect(page2.rows).toHaveLength(2);
      expect(page2.total).toBe(5);
    });

    it('joins department name and role title into list rows', async () => {
      const dept = await seedDepartment(test, { name: 'Sales' });
      const role = await seedRole(test, { title: 'Account Executive' });
      await seedEmployee(test, { departmentId: dept.id, roleId: role.id });

      const result = await repo.findPage({ page: 1, pageSize: 50 });
      expect(result.rows[0]?.department).toEqual({ id: dept.id, name: 'Sales' });
      expect(result.rows[0]?.role).toEqual({ id: role.id, title: 'Account Executive' });
    });

    it('filters by departmentId', async () => {
      const eng = await seedDepartment(test, { name: 'Engineering' });
      const sales = await seedDepartment(test, { name: 'Sales' });
      const role = await seedRole(test);
      await seedEmployee(test, { departmentId: eng.id, roleId: role.id });
      await seedEmployee(test, { departmentId: eng.id, roleId: role.id });
      await seedEmployee(test, { departmentId: sales.id, roleId: role.id });

      const result = await repo.findPage({
        page: 1,
        pageSize: 50,
        filters: { departmentId: eng.id },
      });
      expect(result.total).toBe(2);
      expect(result.rows.every((row) => row.department.id === eng.id)).toBe(true);
    });

    it('filters by status', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      await seedEmployee(test, { departmentId: dept.id, roleId: role.id, status: 'active' });
      await seedEmployee(test, { departmentId: dept.id, roleId: role.id, status: 'on_leave' });
      await seedEmployee(test, { departmentId: dept.id, roleId: role.id, status: 'terminated' });

      const result = await repo.findPage({
        page: 1,
        pageSize: 50,
        filters: { status: 'on_leave' },
      });
      expect(result.total).toBe(1);
      expect(result.rows[0]?.status).toBe('on_leave');
    });

    it('uses FTS5 search to match employees by name or email', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      await seedEmployee(test, {
        departmentId: dept.id,
        roleId: role.id,
        firstName: 'Priya',
        lastName: 'Khanna',
        email: 'priya@example.com',
      });
      await seedEmployee(test, {
        departmentId: dept.id,
        roleId: role.id,
        firstName: 'Devon',
        lastName: 'Marsh',
        email: 'devon@example.com',
      });

      const byLastName = await repo.findPage({
        page: 1,
        pageSize: 50,
        filters: { search: 'khanna' },
      });
      expect(byLastName.total).toBe(1);
      expect(byLastName.rows[0]?.lastName).toBe('Khanna');

      const byEmail = await repo.findPage({
        page: 1,
        pageSize: 50,
        filters: { search: 'devon' },
      });
      expect(byEmail.total).toBe(1);
      expect(byEmail.rows[0]?.firstName).toBe('Devon');
    });

    it('excludes soft-deleted employees by default', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      const alive = await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      const dead = await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      await repo.softDelete(dead.id);

      const result = await repo.findPage({ page: 1, pageSize: 50 });
      expect(result.total).toBe(1);
      expect(result.rows[0]?.id).toBe(alive.id);
    });

    it('includes soft-deleted employees when filters.includeDeleted is true', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      const dead = await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      await repo.softDelete(dead.id);

      const result = await repo.findPage({
        page: 1,
        pageSize: 50,
        filters: { includeDeleted: true },
      });
      expect(result.total).toBe(2);
    });
  });

  describe('findById', () => {
    it('returns the employee with department, role, and manager joined', async () => {
      const dept = await seedDepartment(test, { name: 'Engineering' });
      const role = await seedRole(test, { title: 'Staff Engineer' });
      const manager = await seedEmployee(test, {
        departmentId: dept.id,
        roleId: role.id,
        firstName: 'Maya',
        lastName: 'Patel',
      });
      const employee = await seedEmployee(test, {
        departmentId: dept.id,
        roleId: role.id,
        managerId: manager.id,
      });

      const result = await repo.findById(employee.id);
      expect(result?.id).toBe(employee.id);
      expect(result?.department.name).toBe('Engineering');
      expect(result?.role.title).toBe('Staff Engineer');
      expect(result?.manager).toEqual({ id: manager.id, firstName: 'Maya', lastName: 'Patel' });
    });

    it('returns null for an unknown id', async () => {
      const result = await repo.findById(99_999);
      expect(result).toBeNull();
    });

    it('returns null for a soft-deleted employee', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      const employee = await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      await repo.softDelete(employee.id);

      const result = await repo.findById(employee.id);
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('returns the row for an existing email', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      await seedEmployee(test, {
        departmentId: dept.id,
        roleId: role.id,
        email: 'unique@example.com',
      });

      const result = await repo.findByEmail('unique@example.com');
      expect(result?.email).toBe('unique@example.com');
    });

    it('returns null for an unknown email', async () => {
      const result = await repo.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts an employee and returns it with an id and timestamps', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);

      const created = await repo.create({
        employeeCode: 'EMP-9001',
        firstName: 'New',
        lastName: 'Hire',
        email: 'new.hire@example.com',
        phone: null,
        departmentId: dept.id,
        roleId: role.id,
        managerId: null,
        hireDate: '2026-01-01',
        employmentType: 'full_time',
        status: 'active',
        location: null,
      });

      expect(created.id).toEqual(expect.any(Number));
      expect(created.email).toBe('new.hire@example.com');
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it('rejects a duplicate email at the DB level', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      await seedEmployee(test, {
        departmentId: dept.id,
        roleId: role.id,
        email: 'dup@example.com',
      });

      await expect(
        repo.create({
          employeeCode: 'EMP-DUP',
          firstName: 'Dup',
          lastName: 'Licate',
          email: 'dup@example.com',
          phone: null,
          departmentId: dept.id,
          roleId: role.id,
          managerId: null,
          hireDate: '2026-01-01',
          employmentType: 'full_time',
          status: 'active',
          location: null,
        }),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('updates the given fields and advances updatedAt', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      const employee = await seedEmployee(test, { departmentId: dept.id, roleId: role.id });
      const before = await repo.findById(employee.id);

      await new Promise((resolve) => setTimeout(resolve, 1100));
      const updated = await repo.update(employee.id, { firstName: 'Renamed' });

      expect(updated?.firstName).toBe('Renamed');
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
    });

    it('returns null when updating an unknown id', async () => {
      const result = await repo.update(99_999, { firstName: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and returns true', async () => {
      const dept = await seedDepartment(test);
      const role = await seedRole(test);
      const employee = await seedEmployee(test, { departmentId: dept.id, roleId: role.id });

      const ok = await repo.softDelete(employee.id);
      expect(ok).toBe(true);

      const found = await repo.findById(employee.id);
      expect(found).toBeNull();
    });

    it('returns false for an unknown id', async () => {
      const ok = await repo.softDelete(99_999);
      expect(ok).toBe(false);
    });
  });
});
