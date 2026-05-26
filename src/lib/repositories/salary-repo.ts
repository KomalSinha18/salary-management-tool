import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as schema from '@/lib/db/schema';
import type { Salary, SalaryReason } from '@/lib/db/schema';

export type Db = LibSQLDatabase<typeof schema>;

export type RecordInitialInput = {
  employeeId: number;
  baseSalary: number;
  currency?: string;
  effectiveFrom: string;
  reason: SalaryReason;
};

export type SupersedeInput = {
  employeeId: number;
  baseSalary: number;
  currency?: string;
  effectiveFrom: string;
  reason: SalaryReason;
};

export type SupersedeResult = {
  closed: Salary;
  created: Salary;
};

const NOT_IMPLEMENTED = 'SalaryRepository is not implemented yet — see feat(repositories) commit';

export class SalaryRepository {
  constructor(
    private readonly db: Db,
    private readonly _client: Client,
  ) {
    void this.db;
    void this._client;
  }

  async findCurrent(_employeeId: number): Promise<Salary | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async findHistory(_employeeId: number): Promise<Salary[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async findCurrentForEmployees(_employeeIds: number[]): Promise<Map<number, Salary>> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async recordInitial(_input: RecordInitialInput): Promise<Salary> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async supersede(_input: SupersedeInput): Promise<SupersedeResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
