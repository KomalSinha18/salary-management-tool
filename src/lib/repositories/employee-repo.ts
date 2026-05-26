import type { Client } from '@libsql/client';
import { and, count, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { alias } from 'drizzle-orm/sqlite-core';
import { departments, employees, roles, type Employee, type EmployeeStatus } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { EMPLOYEES_FTS_TABLE } from '@/lib/db/fts';

export type Db = LibSQLDatabase<typeof schema>;

export type EmployeeListItem = Pick<
  Employee,
  | 'id'
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'status'
  | 'employmentType'
  | 'hireDate'
> & {
  department: { id: number; name: string };
  role: { id: number; title: string };
};

export type EmployeeDetail = Employee & {
  department: { id: number; name: string };
  role: { id: number; title: string };
  manager: { id: number; firstName: string; lastName: string } | null;
};

export type EmployeeFilters = {
  search?: string;
  departmentId?: number;
  roleId?: number;
  status?: EmployeeStatus;
  includeDeleted?: boolean;
};

export type FindPageParams = {
  page: number;
  pageSize: number;
  filters?: EmployeeFilters;
};

export type EmployeePage = {
  rows: EmployeeListItem[];
  total: number;
};

export type CreateEmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export type UpdateEmployeeInput = Partial<
  Omit<Employee, 'id' | 'employeeCode' | 'createdAt' | 'updatedAt' | 'deletedAt'>
>;

export class EmployeeRepository {
  constructor(
    private readonly db: Db,
    private readonly _client: Client,
  ) {}

  async findPage(params: FindPageParams): Promise<EmployeePage> {
    const { page, pageSize, filters = {} } = params;
    const predicate = this.buildFilterPredicate(filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          status: employees.status,
          employmentType: employees.employmentType,
          hireDate: employees.hireDate,
          department: { id: departments.id, name: departments.name },
          role: { id: roles.id, title: roles.title },
        })
        .from(employees)
        .innerJoin(departments, eq(employees.departmentId, departments.id))
        .innerJoin(roles, eq(employees.roleId, roles.id))
        .where(predicate)
        .orderBy(employees.id)
        .limit(pageSize)
        .offset((page - 1) * pageSize),

      this.db
        .select({ value: count() })
        .from(employees)
        .where(predicate)
        .then((result) => result[0]?.value ?? 0),
    ]);

    return { rows, total: totalRows };
  }

  async findById(id: number): Promise<EmployeeDetail | null> {
    const managers = alias(employees, 'managers');

    const [row] = await this.db
      .select({
        employee: employees,
        department: { id: departments.id, name: departments.name },
        role: { id: roles.id, title: roles.title },
        manager: {
          id: managers.id,
          firstName: managers.firstName,
          lastName: managers.lastName,
        },
      })
      .from(employees)
      .innerJoin(departments, eq(employees.departmentId, departments.id))
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .leftJoin(managers, eq(employees.managerId, managers.id))
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
      .limit(1);

    if (!row) return null;

    const manager =
      row.manager && row.manager.id !== null && row.manager.firstName && row.manager.lastName
        ? {
            id: row.manager.id,
            firstName: row.manager.firstName,
            lastName: row.manager.lastName,
          }
        : null;

    return {
      ...row.employee,
      department: row.department,
      role: row.role,
      manager,
    };
  }

  async findByEmail(email: string): Promise<Employee | null> {
    const [row] = await this.db.select().from(employees).where(eq(employees.email, email)).limit(1);
    return row ?? null;
  }

  async create(input: CreateEmployeeInput): Promise<Employee> {
    const [row] = await this.db.insert(employees).values(input).returning();
    if (!row) throw new Error('Insert returned no row');
    return row;
  }

  async update(id: number, input: UpdateEmployeeInput): Promise<Employee | null> {
    if (Object.keys(input).length === 0) {
      return this.findRawById(id);
    }

    const [row] = await this.db
      .update(employees)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
      .returning();

    return row ?? null;
  }

  async softDelete(id: number): Promise<boolean> {
    const result = await this.db
      .update(employees)
      .set({ deletedAt: new Date() })
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
      .returning({ id: employees.id });

    return result.length > 0;
  }

  private async findRawById(id: number): Promise<Employee | null> {
    const [row] = await this.db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return row ?? null;
  }

  private buildFilterPredicate(filters: EmployeeFilters): SQL | undefined {
    const conditions: SQL[] = [];

    if (!filters.includeDeleted) {
      conditions.push(isNull(employees.deletedAt));
    }

    if (filters.departmentId !== undefined) {
      conditions.push(eq(employees.departmentId, filters.departmentId));
    }

    if (filters.roleId !== undefined) {
      conditions.push(eq(employees.roleId, filters.roleId));
    }

    if (filters.status !== undefined) {
      conditions.push(eq(employees.status, filters.status));
    }

    if (filters.search && filters.search.trim() !== '') {
      const query = filters.search.trim();
      conditions.push(
        sql`${employees.id} IN (SELECT rowid FROM ${sql.identifier(EMPLOYEES_FTS_TABLE)} WHERE ${sql.identifier(EMPLOYEES_FTS_TABLE)} MATCH ${query})`,
      );
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }
}
