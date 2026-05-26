import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = ['active', 'on_leave', 'terminated'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const SALARY_REASONS = [
  'hire',
  'raise',
  'promotion',
  'market_adjust',
  'demotion',
  'correction',
] as const;
export type SalaryReason = (typeof SALARY_REASONS)[number];

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'supersede', 'restore'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const epochSeconds = () => sql`(unixepoch())`;

export const departments = sqliteTable(
  'departments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    costCenter: text('cost_center'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
  },
  (table) => [uniqueIndex('departments_name_unique').on(table.name)],
);

export const roles = sqliteTable(
  'roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    level: text('level'),
    jobFamily: text('job_family'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
  },
  (table) => [uniqueIndex('roles_title_unique').on(table.title)],
);

export const employees = sqliteTable(
  'employees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    employeeCode: text('employee_code').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    managerId: integer('manager_id').references((): AnySQLiteColumn => employees.id, {
      onDelete: 'set null',
    }),
    hireDate: text('hire_date').notNull(),
    employmentType: text('employment_type', { enum: EMPLOYMENT_TYPES }).notNull(),
    status: text('status', { enum: EMPLOYEE_STATUSES }).notNull().default('active'),
    location: text('location'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('employees_employee_code_unique').on(table.employeeCode),
    uniqueIndex('employees_email_unique').on(table.email),
    index('employees_department_status_idx').on(table.departmentId, table.status),
    index('employees_role_idx').on(table.roleId),
    index('employees_manager_idx').on(table.managerId),
    index('employees_deleted_at_idx').on(table.deletedAt),
  ],
);

export const salaries = sqliteTable(
  'salaries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    baseSalary: integer('base_salary').notNull(),
    currency: text('currency').notNull().default('USD'),
    effectiveFrom: text('effective_from').notNull(),
    effectiveTo: text('effective_to'),
    reason: text('reason', { enum: SALARY_REASONS }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
  },
  (table) => [
    index('salaries_current_idx').on(table.employeeId, table.effectiveTo),
    index('salaries_effective_from_idx').on(table.effectiveFrom),
  ],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actor: text('actor').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    diff: text('diff', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(epochSeconds()),
  },
  (table) => [index('audit_log_entity_idx').on(table.entityType, table.entityId)],
);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

export type Salary = typeof salaries.$inferSelect;
export type NewSalary = typeof salaries.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
