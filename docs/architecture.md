# Architecture

> Salary Management System — interview-grade reference implementation.

This document captures the architectural shape of the system: how requests flow, where logic lives, what we optimise for, and why we made each non-obvious choice. It is deliberately short. Deeper rationale lives in `docs/adr/`.

---

## 1. Goals & non-goals

**Goals**
- Manage a workforce of ~10,000 employees with sub-200ms list/search response times on commodity hardware.
- Provide a salary analytics dashboard that is correct, fast, and time-aware (a raise today should be queryable as "what was the median in Q1?" tomorrow).
- Be testable at every layer without spinning up the full app.
- Be deployable in one command.

**Non-goals (for this iteration)**
- Authentication / RBAC (the system is single-tenant admin-only; auth is a clear M6).
- Multi-currency conversion at query time (we store currency per row; conversion is a presentation concern).
- Real-time collaboration / websockets.

---

## 2. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | RSC for read-heavy dashboards; Server Actions for type-safe mutations. |
| Language | TypeScript (strict) | Type safety end-to-end, including DB schema via Drizzle. |
| DB (dev) | SQLite via `better-sqlite3` | Zero-ops, synchronous API, fast for single-node workloads. |
| DB (prod) | libSQL / Turso | Same dialect, but durable on serverless (Vercel filesystem is ephemeral). |
| ORM | Drizzle | SQL-first, no runtime, generates types from schema, supports migrations. |
| Validation | Zod | One schema reused by form, server action, repository boundary. |
| UI | Tailwind + minimal in-house primitives | No heavy component library; faster bundle. |
| Charts | Recharts | Declarative, RSC-friendly via dynamic import. |
| Testing | Jest + React Testing Library | Unit + integration + component coverage. |
| CI | GitHub Actions | Lint → typecheck → test → build on every PR. |
| Hosting | Vercel (app) + Turso (DB) | Free tier suffices for demo; both scale up cleanly. |

---

## 3. Architectural style

A **layered modular monolith** running inside a single Next.js process. Strict one-way dependency: outer layers may call inner; inner layers know nothing of outer.

```
┌──────────────────────────────────────────────────────────────┐
│  app/  (RSC pages, Client Components, Server Actions, API)  │
├──────────────────────────────────────────────────────────────┤
│                services/  (business logic)                   │
├──────────────────────────────────────────────────────────────┤
│              repositories/  (Drizzle queries)                │
├──────────────────────────────────────────────────────────────┤
│         lib/db/  (Drizzle client, schema, migrations)        │
└──────────────────────────────────────────────────────────────┘
```

**Rules**
- Only `repositories/*` import from `lib/db`. Services and pages must not touch Drizzle directly.
- Services are pure TypeScript and accept a repository (or repository interface) as a dependency — they are unit-testable with no DB.
- Server Actions and route handlers are thin: validate input (Zod), call a service, return a typed response.
- Domain types live in `types/` and are derived from Drizzle's `InferSelectModel` so the database is the source of truth.

---

## 4. Request flow

### 4.1 Read path — `/employees` list

```
Browser ──► RSC page (employees/page.tsx)
              │ reads searchParams (page, q, dept, status)
              ▼
          EmployeeService.list({ page, filters })
              │
              ▼
          EmployeeRepository.findPage({ ... })
              │   SQL: paginated SELECT + COUNT, single round trip
              ▼
          SQLite
              ▲
              │ rows + total
   RSC streams <Table/> → HTML to browser (no client JS for data)
```

### 4.2 Write path — create employee

```
Form (Client Component, react-hook-form + zodResolver)
   │ submit
   ▼
Server Action createEmployee(formData)
   │ Zod parse  → typed input
   ▼
EmployeeService.create(input)
   │ rules: unique email, valid manager, initial salary row
   ▼
EmployeeRepository + SalaryRepository (single tx)
   │
   ▼
revalidatePath('/employees')  ──► RSC re-renders list
```

### 4.3 Analytics path

Server Component issues a parallel `Promise.all` of repository calls. Each repository call is a single aggregate SQL query (`GROUP BY department`, percentile via window functions, etc.). Results are passed to client-side Recharts components. Heavy charts are wrapped in `<Suspense>` so KPI cards render first.

---

## 5. Data model

See `docs/adr/0002-history-aware-salary-table.md` for the key design choice.

```
departments ──┐
              │ 1..N
roles ────────┼──► employees ──1..N──► salaries
              │     ▲
manager ──────┘     │ self-FK
```

| Table | Purpose | Notable columns |
|---|---|---|
| `departments` | Org units | `name UNIQUE`, `cost_center` |
| `roles` | Job titles / levels | `title UNIQUE`, `level`, `job_family` |
| `employees` | Workforce | `employee_code UNIQUE`, `email UNIQUE`, `manager_id` self-FK, `status` enum, `deleted_at` (soft delete) |
| `salaries` | **History-aware** comp records | `base_salary` INTEGER (cents), `effective_from`, `effective_to NULL`, `reason` |
| `audit_log` | Mutation trail | `actor`, `entity_type`, `entity_id`, `diff` JSON |

**Why integer cents:** floating-point breaks aggregation. `SUM(base_salary)` over 10k rows must be exact.

**Why a `salaries` history table:** a salary change is an event, not an overwrite. Storing history means analytics can reconstruct any point in time, an auditor can trace a raise, and we never need a separate audit shadow table for comp. Current salary = `WHERE effective_to IS NULL`.

**Indexes**
- `employees (department_id, status)` — covers the most common list filter combo.
- `employees (role_id)`, `employees (manager_id)`, `employees (email)`.
- `salaries (employee_id, effective_to)` — current-salary lookup.
- `salaries (effective_from)` — time-window aggregates.
- **FTS5** virtual table on `employees(first_name, last_name, email, employee_code)` for instant search.

---

## 6. Folder structure

```
src/
  app/
    (dashboard)/
      layout.tsx                       # shell: nav, container
      employees/
        page.tsx                       # paginated list (RSC)
        new/page.tsx                   # create form
        [id]/page.tsx                  # detail incl. salary history
        [id]/edit/page.tsx             # edit form
      analytics/page.tsx               # KPI cards + charts (RSC + Suspense)
    api/
      employees/route.ts               # POST list (for export), GET
      employees/[id]/route.ts          # GET/PATCH/DELETE
      analytics/[metric]/route.ts      # JSON endpoints (for charts/export)
    layout.tsx  globals.css
  components/
    ui/                                # Button, Input, Table, Modal …
    employees/                         # EmployeeTable, EmployeeForm, FilterBar
    analytics/                         # KpiCard, DeptBreakdownChart, DistributionChart
  lib/
    db/{client,schema,migrations-runner}.ts
    repositories/{employee-repo,salary-repo,analytics-repo}.ts
    services/{employee-service,analytics-service}.ts
    validation/{employee,salary}.ts    # Zod schemas
    errors.ts                          # typed domain errors
    logger.ts                          # pino, request-scoped
  server/actions/{employee-actions,salary-actions}.ts
  types/                               # inferred from Drizzle + Zod
tests/
  unit/                                # services, pure funcs
  integration/                         # repositories against ephemeral SQLite
  component/                           # RTL component tests
scripts/{seed,reset-db}.ts
drizzle/                               # generated migrations
docs/{architecture.md,git-workflow.md,api.md,adr/}
.github/workflows/ci.yml
```

---

## 7. Testing strategy

Three test rings, each fast enough to run on every commit (pre-push hook).

| Ring | Target | Tooling | Example |
|---|---|---|---|
| **Unit** | Services, pure helpers, Zod schemas | Jest | "promote() applies the right effective_from" |
| **Integration** | Repositories against a fresh in-memory SQLite per test file | Jest + better-sqlite3 `:memory:` | "findPage returns ordered, paginated rows with correct total" |
| **Component** | UI in isolation | Jest + RTL | "EmployeeForm shows server validation errors inline" |

**TDD discipline:** every feature branch begins with a failing test commit (`test: …`), followed by the implementation commit (`feat: …`). The PR review checks both exist.

Coverage thresholds (in `jest.config.ts`): 80% lines on `services/`, `repositories/`, `validation/`. UI components are tested by behaviour, not line coverage.

---

## 8. Performance strategy (10,000 employees)

The seed dataset is small enough to fit in memory but large enough to expose bad choices. We optimise the four hot paths.

### 8.1 List page
- **Server-side pagination**: default 50 rows, max 200. Never `SELECT *` without `LIMIT`.
- **Server-side filtering & search**: filter predicates run in SQL, hitting composite indexes. Free-text search uses the FTS5 table, not `LIKE %q%`.
- **Single round trip**: list + total count via a single CTE (`WITH counted AS …`) to avoid two SQLite trips.
- **Eager join** of `departments.name` and `roles.title` in the list query — no N+1.
- **No client-side full list ever**. If a user wants the whole dataset, we stream a CSV from `api/employees?format=csv`.

### 8.2 Analytics
- **All aggregation in SQL.** Examples:
  - `SELECT department_id, AVG(base_salary), COUNT(*) FROM employees JOIN current_salary GROUP BY department_id`
  - Median via SQLite window function: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY base_salary)` (or `NTILE`).
- **A view `current_salary`** abstracts the `effective_to IS NULL` filter so every analytics query stays readable.
- **Suspense streaming**: each chart is its own async RSC, wrapped in `<Suspense>`. The KPI strip paints in <100ms; charts trickle in independently.
- **Cache hint**: analytics route handlers set `revalidate = 60` — dashboard data rarely needs sub-minute freshness.

### 8.3 Seed script
- One **transaction**, **prepared statements**, batched inserts in chunks of 500.
- Deterministic seeding (`faker` with fixed seed) so tests against seeded data are reproducible.
- Target: 10k employees + 10k initial salary rows in under 2 seconds on a laptop.
- WAL mode enabled (`PRAGMA journal_mode = WAL`) for concurrent reads during the seed.

### 8.4 Bundle / runtime
- Recharts imported via `next/dynamic` with `ssr: false` only where unavoidable; otherwise charts render as RSC + client-side hydration of the chart container only.
- No global state library; RSC + Server Actions remove the need.
- Tailwind JIT keeps CSS under 20kb gzipped.

### 8.5 Verification
- `EXPLAIN QUERY PLAN` checked on every aggregate query — must use an index, never a scan.
- Lighthouse run in CI; budget: LCP < 1.5s on the analytics page with the full 10k dataset.

---

## 9. Error handling

- Domain errors are typed (`NotFoundError`, `ConflictError`, `ValidationError`) and live in `lib/errors.ts`.
- Server Actions catch domain errors and return `{ ok: false, code, message }` — never throw to the client.
- Route handlers map domain errors to HTTP codes in a single helper.
- Unexpected errors are logged with a request id and surfaced via `app/error.tsx`.

---

## 10. Observability (lightweight)

- `pino` logger with a per-request id (set in middleware).
- Each repository call logs its SQL + duration at `debug` level (off in prod).
- A `/api/health` endpoint returns `{ db: 'ok', uptime, version }`.

---

## 11. Deployment

- **App**: Vercel (Next.js native). One env var: `DATABASE_URL`.
- **DB**: Turso (libSQL). Free tier covers the demo; migrations run via `drizzle-kit push` in the deploy pipeline.
- **Migrations**: every PR that touches schema must include a Drizzle migration file. CI fails if `drizzle-kit generate` produces a diff.
- **Rollback**: previous Vercel deployment is one click; schema migrations are forward-only with a written rollback note in the PR if non-trivial.

---

## 12. Future work (explicitly out of scope)

- Auth (NextAuth + role-based access).
- Per-user audit (who-edited-what UI).
- Currency conversion at query time.
- Org-chart visualisation.
- Bulk CSV import/export with row-level error reporting.

These are intentionally deferred — listing them keeps reviewers from wondering whether they were forgotten.
