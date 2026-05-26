import type { Client } from '@libsql/client';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { salaries, type Salary, type SalaryReason } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date string, received: ${value}`);
  }
}

function assertPositiveSalary(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`baseSalary must be a positive integer (cents), received: ${value}`);
  }
}

export class SalaryRepository {
  constructor(
    private readonly db: Db,
    private readonly _client: Client,
  ) {}

  async findCurrent(employeeId: number): Promise<Salary | null> {
    const [row] = await this.db
      .select()
      .from(salaries)
      .where(and(eq(salaries.employeeId, employeeId), isNull(salaries.effectiveTo)))
      .limit(1);
    return row ?? null;
  }

  async findHistory(employeeId: number): Promise<Salary[]> {
    return this.db
      .select()
      .from(salaries)
      .where(eq(salaries.employeeId, employeeId))
      .orderBy(desc(salaries.effectiveFrom));
  }

  async findCurrentForEmployees(employeeIds: number[]): Promise<Map<number, Salary>> {
    if (employeeIds.length === 0) return new Map();

    const rows = await this.db
      .select()
      .from(salaries)
      .where(and(inArray(salaries.employeeId, employeeIds), isNull(salaries.effectiveTo)));

    return new Map(rows.map((row) => [row.employeeId, row]));
  }

  async recordInitial(input: RecordInitialInput): Promise<Salary> {
    assertPositiveSalary(input.baseSalary);
    assertValidDate(input.effectiveFrom, 'effectiveFrom');

    const [row] = await this.db
      .insert(salaries)
      .values({
        employeeId: input.employeeId,
        baseSalary: input.baseSalary,
        currency: input.currency ?? 'USD',
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        reason: input.reason,
      })
      .returning();

    if (!row) throw new Error('Insert returned no row');
    return row;
  }

  async supersede(input: SupersedeInput): Promise<SupersedeResult> {
    assertPositiveSalary(input.baseSalary);
    assertValidDate(input.effectiveFrom, 'effectiveFrom');

    return this.db.transaction(async (tx) => {
      const [currentRow] = await tx
        .select()
        .from(salaries)
        .where(and(eq(salaries.employeeId, input.employeeId), isNull(salaries.effectiveTo)))
        .limit(1);

      if (!currentRow) {
        throw new Error(
          `No current salary row for employee ${input.employeeId} — call recordInitial first`,
        );
      }

      if (currentRow.effectiveFrom >= input.effectiveFrom) {
        throw new Error(
          `effectiveFrom (${input.effectiveFrom}) must be after the current row's effectiveFrom (${currentRow.effectiveFrom})`,
        );
      }

      const [closed] = await tx
        .update(salaries)
        .set({ effectiveTo: input.effectiveFrom })
        .where(eq(salaries.id, currentRow.id))
        .returning();

      const [created] = await tx
        .insert(salaries)
        .values({
          employeeId: input.employeeId,
          baseSalary: input.baseSalary,
          currency: input.currency ?? currentRow.currency,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          reason: input.reason,
        })
        .returning();

      if (!closed || !created) throw new Error('Transaction returned no rows');
      return { closed, created };
    });
  }
}
