import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as schema from '@/lib/db/schema';
import type { Employee, EmployeeStatus } from '@/lib/db/schema';

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

const NOT_IMPLEMENTED = 'EmployeeRepository is not implemented yet — see feat(repositories) commit';

export class EmployeeRepository {
  constructor(
    private readonly db: Db,
    private readonly client: Client,
  ) {
    void this.db;
    void this.client;
  }

  async findPage(_params: FindPageParams): Promise<EmployeePage> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async findById(_id: number): Promise<EmployeeDetail | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async findByEmail(_email: string): Promise<Employee | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async create(_input: CreateEmployeeInput): Promise<Employee> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async update(_id: number, _input: UpdateEmployeeInput): Promise<Employee | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async softDelete(_id: number): Promise<boolean> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
