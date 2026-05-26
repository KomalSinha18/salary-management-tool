# Git workflow

> How we branch, commit, review, and release.

This is a deliberately small process — large enough to demonstrate professional habits, small enough that one engineer can follow it end-to-end on a week-long project.

---

## 1. Branch model

We use **GitFlow-lite**: two long-lived branches and short-lived topic branches.

```
  main      ●─────────────────●─────────●───────────►   (tags: v0.1.0, v0.2.0)
             \               / \       /
  develop    ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●►
             │   │     │     │   │
             │   │     │     │   └── feature/analytics-distribution
             │   │     │     └────── fix/employees-pagination-off-by-one
             │   │     └──────────── feature/employees-crud
             │   └────────────────── chore/seed-10k-script
             └────────────────────── feature/db-schema
```

| Branch      | Lifetime         | Receives                                                                             | Protected                                             |
| ----------- | ---------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `main`      | Permanent        | PRs from `develop` (releases) or `hotfix/*`                                          | yes — no direct pushes, required reviews, required CI |
| `develop`   | Permanent        | PRs from `feature/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `test/*`, `perf/*` | yes — required CI, linear history                     |
| `feature/*` | Hours to ~2 days | direct commits                                                                       | no                                                    |
| `hotfix/*`  | Minutes to hours | direct commits; merged into **both** `main` and `develop`                            | no                                                    |

**Why two long-lived branches?** `develop` lets us aggregate several feature merges and verify integration before promoting to production. For a solo project this is overkill in theory, but it demonstrates the discipline reviewers want to see.

---

## 2. Branch naming

Format:

```
<type>/<scope>-<short-kebab-description>
```

| Type       | Used for                            |
| ---------- | ----------------------------------- |
| `feature`  | New user-visible capability         |
| `fix`      | Bug fix on `develop`                |
| `hotfix`   | Urgent bug fix on `main`            |
| `chore`    | Tooling, config, infra, deps        |
| `docs`     | Docs only (no code)                 |
| `refactor` | Internal change, no behaviour delta |
| `test`     | Adding/restructuring tests only     |
| `perf`     | Performance work                    |

**Good**

```
feature/employees-crud
feature/analytics-department-breakdown
fix/employees-pagination-off-by-one
chore/seed-10k-script
docs/architecture-adrs
perf/analytics-median-query
```

**Bad**

```
my-branch                  ← no type, no scope
feature/stuff              ← unclear scope
feature/EmployeesCRUD      ← wrong case
update                     ← unclear everything
```

---

## 3. Commit convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) v1.0, enforced by `commitlint` in a Husky `commit-msg` hook.

```
<type>(<scope>): <imperative subject ≤72 chars>

<body — why this change exists; what it replaces; trade-offs>

<footer — BREAKING CHANGE: …, Closes #12, Refs #34>
```

| Type       | Triggers minor version | Use for                             |
| ---------- | ---------------------- | ----------------------------------- |
| `feat`     | yes                    | New capability                      |
| `fix`      | no (patch)             | Bug fix                             |
| `perf`     | no                     | Performance improvement             |
| `refactor` | no                     | Internal change, no behaviour delta |
| `test`     | no                     | Test-only changes                   |
| `docs`     | no                     | Documentation only                  |
| `style`    | no                     | Formatting, whitespace              |
| `chore`    | no                     | Tooling, deps, config               |
| `build`    | no                     | Build system, bundler               |
| `ci`       | no                     | CI config                           |

Append `!` after type for breaking changes: `feat(api)!: rename /employees to /staff`.

### Examples

```
feat(employees): add server-side paginated list

The list page must remain responsive at 10k rows. Pagination,
filtering, and search are pushed to SQL via composite indexes;
the count is computed in the same round trip with a CTE.

Closes #14
```

```
fix(salaries): preserve effective_to when superseding a row

Previously a promotion overwrote the old salary row instead of
closing it (effective_to remained NULL on both rows), corrupting
any time-window aggregate. Now the supersede happens in a tx.

Refs #22
```

```
chore(ci): add commitlint and conventional-changelog action
```

### Commit hygiene

- **Small commits.** A commit is the smallest change that leaves the tree green. "Add schema" and "add repository for schema" are two commits.
- **Imperative mood.** `add`, not `added` or `adds`.
- **One concern per commit.** Mixing a refactor into a feature commit makes review and bisect painful.
- **TDD pairing.** A feature usually appears as two adjacent commits: `test(employees): cover create rules` then `feat(employees): implement create`. This is a visible artifact of TDD discipline.

---

## 4. Pull request workflow

1. **Open** a PR early — even as draft — so CI runs.
2. **Title** uses the same Conventional Commits format as a commit subject. The PR title becomes the squash-merge commit message.
3. **Description** template:

   ```markdown
   ## What

   <one paragraph>

   ## Why

   <link to issue / milestone, motivation>

   ## How

   <key decisions, alternatives considered>

   ## Tests

   <what's covered, what's deliberately not>

   ## Screenshots / output

   <if UI or CLI>

   ## Checklist

   - [ ] Tests added/updated
   - [ ] Docs updated (if behaviour or API changed)
   - [ ] Migration included (if schema changed)
   - [ ] No console.log / TODO left behind
   ```

4. **CI must pass**: lint, typecheck, unit + integration + component tests, build.
5. **Self-review the diff** in GitHub before requesting review. Most issues are caught here.
6. **Merge strategy: squash-merge** into `develop`. One PR = one commit on `develop`. History stays linear and bisectable.
7. **Delete the branch** after merge (GitHub setting).

---

## 5. Releases (`develop` → `main`)

1. Open a PR `develop` → `main` titled `release: vX.Y.Z`.
2. Description = auto-generated changelog from Conventional Commits since the last tag.
3. **Merge strategy: merge-commit** (not squash) — preserves the individual feature commits on `main` for traceability.
4. After merge, tag `main`: `git tag -a vX.Y.Z -m "…"` and push the tag. Vercel deploys on tag.
5. Version bump in `package.json` happens as part of the release PR (`chore(release): v0.2.0`).

---

## 6. Hotfix flow

1. Branch from `main`: `git checkout -b hotfix/critical-thing main`.
2. Fix + test + commit (`fix:` type).
3. PR into `main`. Squash-merge. Tag `vX.Y.(Z+1)`.
4. **Immediately** open a second PR merging `main` back into `develop` so the fix is not lost in the next release.

---

## 7. Automation

| Hook / job        | Tool                | What it does                                         |
| ----------------- | ------------------- | ---------------------------------------------------- |
| `pre-commit`      | Husky + lint-staged | Prettier + ESLint on staged files                    |
| `commit-msg`      | Husky + commitlint  | Reject non-conventional messages                     |
| `pre-push`        | Husky               | Run `tsc --noEmit` and unit tests                    |
| CI on PR          | GitHub Actions      | Lint, typecheck, all tests, build, Lighthouse budget |
| CI on `main` push | GitHub Actions      | Build + deploy to Vercel + run migrations            |

---

## 8. Rules of thumb

- **No direct pushes** to `main` or `develop`. Ever.
- **No force-push** to shared branches. Force-push only on your own `feature/*` before review.
- **No `--no-verify`** without an explicit note in the PR.
- **Rebase your feature branch on `develop`** before opening a PR. Resolve conflicts on your branch, not in the merge.
- **If a PR grows past ~400 lines of diff**, split it. Reviewers stop reading after that.
- **Every commit on `develop` must be green.** If you discover otherwise, the next commit is a `fix:` not a `git reset`.

---

## 9. Quick reference

```bash
# Start a feature
git checkout develop && git pull
git checkout -b feature/employees-crud

# Daily — keep up to date
git fetch origin
git rebase origin/develop

# Commit (commitlint will validate)
git add -p
git commit -m "feat(employees): add paginated list endpoint"

# Push and open PR
git push -u origin feature/employees-crud
gh pr create --base develop --fill

# Release
gh pr create --base main --head develop --title "release: v0.2.0"
```
