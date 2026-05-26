import { departments, employees, roles, salaries } from '@/lib/db/schema';
import type { TestDb } from './test-db';
import type { EmploymentType, EmployeeStatus, SalaryReason } from '@/lib/db/schema';

let codeCounter = 0;
let emailCounter = 0;

export function resetFactoryCounters(): void {
  codeCounter = 0;
  emailCounter = 0;
}

export async function seedDepartment(
  test: TestDb,
  overrides: Partial<{ name: string; costCenter: string }> = {},
): Promise<{ id: number }> {
  const [row] = await test.db
    .insert(departments)
    .values({
      name: overrides.name ?? `Department ${Math.random().toString(36).slice(2, 8)}`,
      costCenter: overrides.costCenter ?? null,
    })
    .returning({ id: departments.id });

  if (!row) throw new Error('Failed to seed department');
  return row;
}

export async function seedRole(
  test: TestDb,
  overrides: Partial<{ title: string; level: string; jobFamily: string }> = {},
): Promise<{ id: number }> {
  const [row] = await test.db
    .insert(roles)
    .values({
      title: overrides.title ?? `Role ${Math.random().toString(36).slice(2, 8)}`,
      level: overrides.level ?? null,
      jobFamily: overrides.jobFamily ?? null,
    })
    .returning({ id: roles.id });

  if (!row) throw new Error('Failed to seed role');
  return row;
}

type SeedEmployeeOverrides = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  departmentId: number;
  roleId: number;
  managerId: number;
  hireDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  location: string;
}>;

export async function seedEmployee(
  test: TestDb,
  overrides: SeedEmployeeOverrides = {},
): Promise<{ id: number }> {
  const departmentId = overrides.departmentId ?? (await seedDepartment(test)).id;
  const roleId = overrides.roleId ?? (await seedRole(test)).id;

  codeCounter += 1;
  emailCounter += 1;

  const [row] = await test.db
    .insert(employees)
    .values({
      employeeCode: overrides.employeeCode ?? `EMP-${String(codeCounter).padStart(5, '0')}`,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'Person',
      email: overrides.email ?? `test.person.${emailCounter}@example.com`,
      departmentId,
      roleId,
      managerId: overrides.managerId ?? null,
      hireDate: overrides.hireDate ?? '2024-01-01',
      employmentType: overrides.employmentType ?? 'full_time',
      status: overrides.status ?? 'active',
      location: overrides.location ?? null,
    })
    .returning({ id: employees.id });

  if (!row) throw new Error('Failed to seed employee');
  return row;
}

type SeedSalaryOverrides = Partial<{
  baseSalary: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: SalaryReason;
}>;

export async function seedSalary(
  test: TestDb,
  employeeId: number,
  overrides: SeedSalaryOverrides = {},
): Promise<{ id: number }> {
  const [row] = await test.db
    .insert(salaries)
    .values({
      employeeId,
      baseSalary: overrides.baseSalary ?? 10_000_000,
      currency: overrides.currency ?? 'USD',
      effectiveFrom: overrides.effectiveFrom ?? '2024-01-01',
      effectiveTo: overrides.effectiveTo ?? null,
      reason: overrides.reason ?? 'hire',
    })
    .returning({ id: salaries.id });

  if (!row) throw new Error('Failed to seed salary');
  return row;
}
