CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`action` text NOT NULL,
	`diff` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cost_center` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_code` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`department_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`manager_id` integer,
	`hire_date` text NOT NULL,
	`employment_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`location` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_unique` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `employees_department_status_idx` ON `employees` (`department_id`,`status`);--> statement-breakpoint
CREATE INDEX `employees_role_idx` ON `employees` (`role_id`);--> statement-breakpoint
CREATE INDEX `employees_manager_idx` ON `employees` (`manager_id`);--> statement-breakpoint
CREATE INDEX `employees_deleted_at_idx` ON `employees` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`level` text,
	`job_family` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_title_unique` ON `roles` (`title`);--> statement-breakpoint
CREATE TABLE `salaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`base_salary` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `salaries_current_idx` ON `salaries` (`employee_id`,`effective_to`);--> statement-breakpoint
CREATE INDEX `salaries_effective_from_idx` ON `salaries` (`effective_from`);