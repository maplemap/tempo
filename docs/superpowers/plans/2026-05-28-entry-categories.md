# Entry Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Review / Bug / Refactor / Task / Daily categories to time entries with keyword-based auto-detection (no AI), per-entry manual override, and a hierarchical "By category" drill-down on the Dashboard.

**Architecture:** A pure `categorize(text)` function in `backend/src/lib/categorize.ts` matches keyword regexes in priority order and returns one of five lowercase category strings (default `task`). Auto-detect runs in the backend on entry create (timer start) and on description update (in `entries.ts`), but only while `category_manual=0`. A new `PATCH /api/entries/:id/category` endpoint lets the UI set a manual override (or reset to auto). A new `GET /api/stats/by-category` endpoint returns a nested `categories → tasks → entries` structure for the Dashboard. The data model gains two columns on `time_entries`: `category` (text) and `category_manual` (int flag).

**Tech Stack:** Node.js (ESM) + TypeScript strict, Fastify 4, better-sqlite3 (raw prepared statements), React 18 + Vite, plain CSS. No test framework — sanity-test the pure `categorize()` function with built-in `node --test` via `tsx`, and verify everything else manually via the running app, matching project convention.

**Spec:** `docs/superpowers/specs/2026-05-28-entry-categories-design.md`

---

## File Structure

**Create:**
- `shared/types/category.ts` — `Category` union type and `CATEGORIES` const
- `backend/src/lib/categorize.ts` — `categorize()` and `categorizeEntry()` pure functions
- `backend/src/lib/categorize.test.ts` — one-off `node:test` sanity check for the regex priority logic
- `frontend/src/components/CategoryBadge.tsx` — `[category]` badge + dropdown to override / reset

**Modify:**
- `shared/types/entry.ts` — add `category` and `category_manual` to `Entry`
- `shared/types/index.ts` — re-export `category` module
- `backend/src/db/index.ts` — two `ALTER TABLE`, new index, one-off backfill block
- `backend/src/routes/timer.ts` — categorize on `/start` (entries are inserted there)
- `backend/src/routes/entries.ts` — categorize on PATCH description; new `PATCH /:id/category`; expose `category` and `category_manual` in responses
- `backend/src/routes/stats.ts` — new `GET /by-category` endpoint
- `frontend/src/lib/api.ts` — extend `Entry` type, add `entries.setCategory()` and `stats.byCategory()`
- `frontend/src/components/EntryItem.tsx` — render `<CategoryBadge>` and wire its handler
- `frontend/src/pages/DashboardPage.tsx` — new "By category" section with expand/collapse

---

## Task 1: Shared Category type

**Files:**
- Create: `shared/types/category.ts`
- Modify: `shared/types/index.ts`
- Modify: `shared/types/entry.ts`

- [ ] **Step 1: Create the Category module**

Create `shared/types/category.ts`:

```ts
export type Category = 'review' | 'bug' | 'refactor' | 'task' | 'daily';

export const CATEGORIES: Category[] = ['review', 'bug', 'refactor', 'task', 'daily'];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value);
}
```

- [ ] **Step 2: Re-export from the index**

Modify `shared/types/index.ts` — add the new line:

```ts
export * from './entry.js';
export * from './project.js';
export * from './sync.js';
export * from './category.js';
```

- [ ] **Step 3: Extend the Entry type**

Modify `shared/types/entry.ts` — add two fields to the `Entry` interface (insert after `duration_seconds`):

```ts
import type { Category } from './category.js';

export interface EntryLink {
  id: number;
  entry_id: number;
  url: string;
  label: string | null;
}

export interface Entry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  github_repo: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  category: Category;
  category_manual: 0 | 1;
  links: EntryLink[];
  badges: string[];
}

export interface TimerEntry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  github_repo: string | null;
  description: string | null;
  started_at: string;
}
```

- [ ] **Step 4: Typecheck**

Run from project root:

```bash
cd backend && npm run typecheck && cd ../frontend && npx tsc --noEmit && cd ..
```

Expected: PASS in both (the frontend `api.ts` inlines its own `Entry` copy, so it won't fail yet; we update that copy in Task 8). If the frontend typecheck reports unrelated errors, ignore — only the lines you changed must pass.

Note: backend has `npm run typecheck`; frontend doesn't — use `npx tsc --noEmit` for frontend everywhere in this plan.

- [ ] **Step 5: Commit**

```bash
git add shared/types/category.ts shared/types/index.ts shared/types/entry.ts
git commit -m "feat(types): add Category union and extend Entry"
```

---

## Task 2: `categorize()` pure function + sanity test

**Files:**
- Create: `backend/src/lib/categorize.ts`
- Create: `backend/src/lib/categorize.test.ts`

- [ ] **Step 1: Write the sanity test first**

Create `backend/src/lib/categorize.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, categorizeEntry } from './categorize.js';

test('empty input returns task', () => {
  assert.equal(categorize(''), 'task');
  assert.equal(categorize('   '), 'task');
});

test('daily keywords', () => {
  assert.equal(categorize('daily standup notes'), 'daily');
  assert.equal(categorize('team sync'), 'daily');
  assert.equal(categorize('мітинг з командою'), 'daily');
  assert.equal(categorize('дейлі'), 'daily');
});

test('review keywords', () => {
  assert.equal(categorize('review PR #234'), 'review');
  assert.equal(categorize('code review for auth'), 'review');
  assert.equal(categorize('PR 99 needs eyes'), 'review');
  assert.equal(categorize('огляд коду'), 'review');
});

test('bug keywords', () => {
  assert.equal(categorize('fix login redirect bug'), 'bug');
  assert.equal(categorize('hotfix for timer'), 'bug');
  assert.equal(categorize('виправити помилку'), 'bug');
});

test('refactor keywords', () => {
  assert.equal(categorize('refactor auth module'), 'refactor');
  assert.equal(categorize('cleanup callbacks'), 'refactor');
  assert.equal(categorize('extract helper'), 'refactor');
  assert.equal(categorize('рефактор logging'), 'refactor');
});

test('priority: daily beats review', () => {
  assert.equal(categorize('daily review of dashboards'), 'daily');
});

test('priority: review beats bug and refactor', () => {
  assert.equal(categorize('review bug fix PR'), 'review');
  assert.equal(categorize('review refactor PR'), 'review');
});

test('priority: bug beats refactor', () => {
  assert.equal(categorize('fix bug after refactor'), 'bug');
});

test('no keywords returns task', () => {
  assert.equal(categorize('implement settings page'), 'task');
  assert.equal(categorize('write docs'), 'task');
});

test('word boundaries: previewing is not review', () => {
  // "preview" doesn't contain the word "review" with word boundaries
  assert.equal(categorize('preview the new layout'), 'task');
});

test('word boundaries: buggy is not bug', () => {
  assert.equal(categorize('buggy whip era'), 'task');
});

test('categorizeEntry combines task name and description', () => {
  assert.equal(categorizeEntry('Login refactor', null), 'refactor');
  assert.equal(categorizeEntry('Login refactor', 'fix login redirect bug'), 'bug');
  assert.equal(categorizeEntry(null, null), 'task');
  assert.equal(categorizeEntry('', ''), 'task');
});
```

- [ ] **Step 2: Run the test (it should fail — no implementation yet)**

```bash
cd backend && npx tsx --test src/lib/categorize.test.ts
```

Expected: FAIL — `Cannot find module './categorize.js'` or similar import error.

- [ ] **Step 3: Implement `categorize.ts`**

Create `backend/src/lib/categorize.ts`:

```ts
import type { Category } from '../../../shared/types/category.js';

// Order matters: first match wins.
// Priority — Daily > Review > Bug > Refactor > Task (default).
const RULES: Array<{ category: Category; patterns: RegExp[] }> = [
  {
    category: 'daily',
    patterns: [
      /\b(daily|standup|stand-up|sync|митинг|мітинг|дейлі|дейли|синк)\b/iu,
    ],
  },
  {
    category: 'review',
    patterns: [
      /\b(review|reviewing|reviewed|огляд|ревʼю|ревью|cr)\b/iu,
      /\bcode\s*review\b/iu,
      /\bPR\s+#?\d+/iu,
    ],
  },
  {
    category: 'bug',
    patterns: [
      /\b(bug|fix|fixing|fixed|hotfix|issue|defect|помилка|баг|фікс|фіксити|регрес)\b/iu,
    ],
  },
  {
    category: 'refactor',
    patterns: [
      /\b(refactor|refactoring|cleanup|clean-up|tidy|simplify|rename|extract|рефактор|рефакторинг|почистити)\b/iu,
    ],
  },
];

export function categorize(text: string): Category {
  const normalized = text.trim();
  if (!normalized) return 'task';
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      return rule.category;
    }
  }
  return 'task';
}

export function categorizeEntry(
  taskName: string | null,
  description: string | null
): Category {
  return categorize([taskName, description].filter(Boolean).join(' '));
}
```

- [ ] **Step 4: Re-run the test, expect all pass**

```bash
cd backend && npx tsx --test src/lib/categorize.test.ts
```

Expected: all 12 tests pass. If any fail, fix the regex in `categorize.ts`. Don't change the test expectations — they encode the spec's priority order.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/categorize.ts backend/src/lib/categorize.test.ts
git commit -m "feat(backend): add categorize() with keyword priority rules"
```

---

## Task 3: Schema migration + backfill

**Files:**
- Modify: `backend/src/db/index.ts`

- [ ] **Step 1: Add the two columns + index + backfill**

Modify `backend/src/db/index.ts`. After the existing `try { db.exec(\`ALTER TABLE plans ADD COLUMN task_id …\`); } catch {}` line (currently line 23), insert:

```ts
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'task'`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category_manual INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_category_started ON time_entries(category, started_at)`); } catch {}
```

Then, after the existing tasks-backfill block (the one ending around line 55 with `console.log(\`[db] backfilled ${pairs.length} tasks …\`);`), append the category backfill:

```ts
// Backfill: categorize all existing entries on first run after the migration.
import { categorizeEntry } from '../lib/categorize.js';

const categorized = (db.prepare(
  `SELECT COUNT(*) AS n FROM time_entries WHERE category != 'task'`
).get() as { n: number }).n;

if (categorized === 0) {
  const rows = db.prepare(`
    SELECT e.id, e.description, t.name AS task_name
    FROM time_entries e
    LEFT JOIN tasks t ON t.id = e.task_id
  `).all() as Array<{ id: number; description: string | null; task_name: string | null }>;

  if (rows.length > 0) {
    const updateCategory = db.prepare(`UPDATE time_entries SET category = ? WHERE id = ?`);
    db.transaction((items: typeof rows) => {
      for (const r of items) {
        updateCategory.run(categorizeEntry(r.task_name, r.description), r.id);
      }
    })(rows);
    console.log(`[db] backfilled categories for ${rows.length} entries`);
  }
}
```

**Important:** `import` statements must be at the top of the file in ESM. Move the `import { categorizeEntry } from '../lib/categorize.js';` line into the existing import block at the top of `backend/src/db/index.ts`, alongside the other imports. The backfill code (the `const categorized = …` block onward) stays where described above.

- [ ] **Step 2: Verify the file still typechecks**

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the backend once to apply the migration**

```bash
cd backend && npm run dev
```

Watch the console. Expect to see:
- `[db] using /…/tempo.db`
- `[db] backfilled categories for N entries` (N = total existing entries; will be 0 only on a brand-new database)

Stop the server (Ctrl-C) once the migration log appears.

- [ ] **Step 4: Sanity-check via SQLite**

```bash
sqlite3 backend/data/tempo.db "SELECT category, COUNT(*) FROM time_entries GROUP BY category;"
```

Expected: a list like `bug|12`, `review|8`, `task|45`, etc. Exact numbers depend on existing data, but `task` should not be 100% of rows (otherwise backfill didn't run or regex never matched).

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/index.ts
git commit -m "feat(db): add category columns and backfill existing entries"
```

---

## Task 4: Auto-detect on entry create (timer start)

**Files:**
- Modify: `backend/src/routes/timer.ts`

- [ ] **Step 1: Import the categorizer and adjust the insert**

Modify `backend/src/routes/timer.ts`.

Add at the top with the other imports:

```ts
import { categorizeEntry } from '../lib/categorize.js';
import type { Category } from '../../../shared/types/category.js';
```

Replace the existing `insertEntry` prepared statement (currently around lines 28–32) and its `interface InsertParams` with:

```ts
interface InsertParams {
  projectId: number | null;
  taskId: number | null;
  description: string;
  startedAt: string;
  category: Category;
}
const insertEntry = db.prepare<InsertParams>(`
  INSERT INTO time_entries (project_id, task_id, description, started_at, category, category_manual)
  VALUES (@projectId, @taskId, @description, @startedAt, @category, 0)
`);
```

Inside the `fastify.post('/start', …)` handler, after the `if (taskId) { … }` block that resolves `finalDescription`, and before the `insertEntry.run(…)` call, compute the category:

```ts
let taskName: string | null = null;
if (taskId) {
  const task = db.prepare<[number], { name: string }>(
    `SELECT name FROM tasks WHERE id = ?`
  ).get(taskId);
  if (task) taskName = task.name;
}
const category = categorizeEntry(taskName, finalDescription);
```

(Note: the existing handler already does a similar `SELECT name FROM tasks WHERE id = ?` lookup to set `finalDescription`. You can either reuse that lookup's result for `taskName` or do a single combined lookup — show the combined version below to avoid the double query.)

The final `fastify.post('/start', …)` handler should look like this (replace the existing handler body):

```ts
fastify.post<{ Body: { projectId?: number | null; taskId?: number | null; description?: string } }>(
  '/start',
  async (req) => {
    const { projectId = null, taskId = null, description = '' } = req.body;

    let finalDescription = description;
    let taskName: string | null = null;
    if (taskId) {
      const task = db.prepare<[number], { name: string }>(
        `SELECT name FROM tasks WHERE id = ?`
      ).get(taskId);
      if (task) {
        taskName = task.name;
        finalDescription = task.name;
      }
    }
    const category = categorizeEntry(taskName, finalDescription);

    closeAllOpen.run({ endedAt: nowIso() });
    const result = insertEntry.run({
      projectId: projectId ?? null,
      taskId: taskId ?? null,
      description: finalDescription,
      startedAt: nowIso(),
      category,
    });
    const row = db.prepare<[number | bigint], TimerRow>(`
      SELECT e.*, p.name AS project_name, p.github_repo
      FROM time_entries e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ?
    `).get(result.lastInsertRowid);
    return { current: row };
  }
);
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Smoke-test in the browser**

```bash
cd backend && npm run dev
```

In another terminal:

```bash
cd frontend && npm run dev
```

Open the timer page, start a timer with description `fix login redirect bug` and no task. Stop the timer. Then:

```bash
sqlite3 backend/data/tempo.db "SELECT id, description, category, category_manual FROM time_entries ORDER BY id DESC LIMIT 1;"
```

Expected: one row with `category=bug`, `category_manual=0`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/timer.ts
git commit -m "feat(timer): auto-detect category when starting a timer"
```

---

## Task 5: Auto-detect on entry update + expose category in responses

**Files:**
- Modify: `backend/src/routes/entries.ts`

- [ ] **Step 1: Extend `DbEntry`, import categorizer**

Modify `backend/src/routes/entries.ts`.

Add at the top with the other imports:

```ts
import { categorizeEntry } from '../lib/categorize.js';
import type { Category } from '../../../shared/types/category.js';
```

Extend the `DbEntry` interface (lines 7–17) to include the new columns:

```ts
interface DbEntry {
  id: number;
  project_id: number | null;
  task_id: number | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  category: Category;
  category_manual: 0 | 1;
  project_name: string | null;
  github_repo: string | null;
}
```

The existing `SELECT e.*, …` queries already pull `category` and `category_manual` automatically via `e.*`, so no SQL changes needed for the list/get queries.

- [ ] **Step 2: Update the PATCH handler to recategorize on description change**

Inside the existing `fastify.patch('/:id', …)` handler, find the `UPDATE time_entries SET … WHERE id = @id` prepared statement (lines 152–172) and the surrounding logic. Replace the entire handler body with:

```ts
fastify.patch<{ Params: { id: string }; Body: Partial<DbEntry> }>('/:id', async (req, reply) => {
  const current = getEntry.get(req.params.id);
  if (!current) { reply.code(404).send({ error: 'not found' }); return; }

  const next = { ...current, ...req.body };
  const startedAt = next.started_at;
  const endedAt = next.ended_at;

  if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
    reply.code(400).send({ error: 'ended_at must be after start' }); return;
  }

  const duration = endedAt ? diffSeconds(startedAt, endedAt) : null;

  // Recompute category only if not manually overridden AND description or task_id changed.
  let nextCategory: Category = current.category;
  if (!current.category_manual) {
    const descriptionChanged = next.description !== current.description;
    const taskChanged = next.task_id !== current.task_id;
    if (descriptionChanged || taskChanged) {
      const task = next.task_id
        ? db.prepare<[number], { name: string }>(`SELECT name FROM tasks WHERE id = ?`).get(next.task_id)
        : null;
      nextCategory = categorizeEntry(task?.name ?? null, next.description ?? null);
    }
  }

  db.prepare<{
    id: number; project_id: number | null; task_id: number | null; description: string;
    started_at: string; ended_at: string | null; duration_seconds: number | null; category: Category;
  }>(`
    UPDATE time_entries
    SET project_id = @project_id,
        task_id = @task_id,
        description = @description,
        started_at = @started_at,
        ended_at = @ended_at,
        duration_seconds = @duration_seconds,
        category = @category
    WHERE id = @id
  `).run({
    id: current.id,
    project_id: next.project_id ?? null,
    task_id: next.task_id ?? null,
    description: next.description ?? '',
    started_at: startedAt,
    ended_at: endedAt ?? null,
    duration_seconds: duration,
    category: nextCategory,
  });

  const saved = getEntry.get(current.id);
  if (saved) await autoLinkPRs(current.id, saved.description, saved.github_repo).catch(() => {});
  const final = getEntry.get(current.id);
  return { entry: final ? hydrate(final) : null };
});
```

Notes:
- We do **not** allow the generic PATCH to set `category` or `category_manual` directly. Category override lives in its own endpoint (Task 6). If a client sends `category` in the body, it's ignored — only computed value is written.
- `category_manual` is preserved across PATCH (not in the SET clause) — only the dedicated endpoint flips it.

- [ ] **Step 3: Update `hydrate()` to surface the new fields**

Find the `Entry extends DbEntry` interface (currently lines 26–29) — since it extends `DbEntry`, it already inherits `category` and `category_manual`, so no change needed there. The `hydrate()` function spreads `entry`, so the fields are automatically included in the response. No edits required in this step — just verify by reading the file that `hydrate()` returns `{ ...entry, links, badges }` (still lines around 109–115).

- [ ] **Step 4: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Smoke-test**

Start both servers (as in Task 4). Pick any existing entry on the EntriesPage, edit its description to `fix critical bug`, blur the input to save, then:

```bash
sqlite3 backend/data/tempo.db "SELECT id, description, category, category_manual FROM time_entries WHERE id = <THAT_ID>;"
```

Expected: `category=bug`, `category_manual=0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/entries.ts
git commit -m "feat(entries): re-categorize on description/task change"
```

---

## Task 6: New endpoint — manual category override

**Files:**
- Modify: `backend/src/routes/entries.ts`

- [ ] **Step 1: Add the new PATCH route**

In `backend/src/routes/entries.ts`, add a new import at the top:

```ts
import { isCategory } from '../../../shared/types/category.js';
```

Then add the new route inside the `export default async function entryRoutes(…)` body, alongside the other routes (e.g. just after the existing `fastify.delete('/:id', …)` handler):

```ts
fastify.patch<{ Params: { id: string }; Body: { category?: unknown } }>(
  '/:id/category',
  async (req, reply) => {
    const current = getEntry.get(req.params.id);
    if (!current) { reply.code(404).send({ error: 'not found' }); return; }

    const value = req.body?.category;

    if (value === null) {
      // Reset to auto: recompute from current task name + description.
      const task = current.task_id
        ? db.prepare<[number], { name: string }>(`SELECT name FROM tasks WHERE id = ?`).get(current.task_id)
        : null;
      const auto = categorizeEntry(task?.name ?? null, current.description);
      db.prepare(`UPDATE time_entries SET category = ?, category_manual = 0 WHERE id = ?`)
        .run(auto, current.id);
    } else if (isCategory(value)) {
      db.prepare(`UPDATE time_entries SET category = ?, category_manual = 1 WHERE id = ?`)
        .run(value, current.id);
    } else {
      reply.code(400).send({ error: 'invalid category' });
      return;
    }

    const final = getEntry.get(current.id);
    return { entry: final ? hydrate(final) : null };
  }
);
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Manual cURL smoke-test**

With both servers running and a valid session cookie (log in via the UI first, then grab the `tempo_session` cookie value from devtools):

```bash
# pick a real entry id from the EntriesPage
ENTRY_ID=<id>
COOKIE='tempo_session=<value>'

# Set manual category
curl -i -X PATCH "http://localhost:3001/api/entries/$ENTRY_ID/category" \
  -H "content-type: application/json" \
  -H "cookie: $COOKIE" \
  -d '{"category":"refactor"}'
# Expect 200, entry.category=refactor, category_manual=1

# Reset to auto
curl -i -X PATCH "http://localhost:3001/api/entries/$ENTRY_ID/category" \
  -H "content-type: application/json" \
  -H "cookie: $COOKIE" \
  -d '{"category":null}'
# Expect 200, entry.category recomputed from description/task name, category_manual=0

# Invalid value
curl -i -X PATCH "http://localhost:3001/api/entries/$ENTRY_ID/category" \
  -H "content-type: application/json" \
  -H "cookie: $COOKIE" \
  -d '{"category":"bogus"}'
# Expect 400 {"error":"invalid category"}
```

Replace `3001` with the actual `PORT` from your `.env` if different.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/entries.ts
git commit -m "feat(entries): add PATCH /:id/category for manual override and reset"
```

---

## Task 7: New endpoint — `GET /stats/by-category`

**Files:**
- Modify: `backend/src/routes/stats.ts`

- [ ] **Step 1: Add the route, prepared statement, and grouping logic**

Modify `backend/src/routes/stats.ts`.

Add at the top with the other imports:

```ts
import type { Category } from '../../../shared/types/category.js';
```

Add a new prepared statement near the other `db.prepare(...)` calls (e.g. after `eventsInRange`):

```ts
interface ByCategoryRow {
  category: Category;
  task_id: number | null;
  task_name: string | null;
  entry_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  description: string | null;
}

const entriesForByCategory = db.prepare<RangeParams, ByCategoryRow>(`
  SELECT
    e.category                  AS category,
    e.task_id                   AS task_id,
    t.name                      AS task_name,
    e.id                        AS entry_id,
    e.started_at                AS started_at,
    e.ended_at                  AS ended_at,
    COALESCE(e.duration_seconds, 0) AS duration_seconds,
    e.description               AS description
  FROM time_entries e
  LEFT JOIN tasks t ON t.id = e.task_id
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso AND e.duration_seconds IS NOT NULL
  ORDER BY e.started_at DESC
`);
```

Add the route inside `export default async function statsRoutes(…)`:

```ts
fastify.get<{ Querystring: { from?: string; to?: string } }>('/by-category', async (req) => {
  const { from, to } = req.query;
  const { fromIso, toIso } = parseRange(from, to);
  const rows = entriesForByCategory.all({ fromIso, toIso });

  // Group: category → task → entries
  interface EntryOut {
    id: number;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number;
    description: string | null;
  }
  interface TaskOut {
    task_id: number | null;
    task_name: string | null;
    total: number;
    entries: EntryOut[];
  }
  interface CategoryOut {
    category: Category;
    total: number;
    tasks: TaskOut[];
  }

  const catMap = new Map<Category, Map<string, TaskOut>>();
  let grandTotal = 0;

  for (const r of rows) {
    grandTotal += r.duration_seconds;
    if (!catMap.has(r.category)) catMap.set(r.category, new Map());
    const taskKey = r.task_id == null ? 'null' : String(r.task_id);
    const taskMap = catMap.get(r.category)!;
    if (!taskMap.has(taskKey)) {
      taskMap.set(taskKey, {
        task_id: r.task_id,
        task_name: r.task_name,
        total: 0,
        entries: [],
      });
    }
    const t = taskMap.get(taskKey)!;
    t.total += r.duration_seconds;
    t.entries.push({
      id: r.entry_id,
      started_at: r.started_at,
      ended_at: r.ended_at,
      duration_seconds: r.duration_seconds,
      description: r.description,
    });
  }

  const categories: CategoryOut[] = [...catMap.entries()].map(([category, taskMap]) => {
    const tasks = [...taskMap.values()].sort((a, b) => b.total - a.total);
    const total = tasks.reduce((s, t) => s + t.total, 0);
    return { category, total, tasks };
  }).sort((a, b) => b.total - a.total);

  return {
    range: { from: fromIso, to: toIso },
    total: grandTotal,
    categories,
  };
});
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: cURL smoke-test**

With the backend running:

```bash
COOKIE='tempo_session=<value>'
curl -s "http://localhost:3001/api/stats/by-category?from=2026-05-21T00:00:00.000Z&to=2026-05-29T00:00:00.000Z" \
  -H "cookie: $COOKIE" | python3 -m json.tool | head -60
```

Expected: JSON with `range`, `total > 0`, `categories: [...]` sorted by `total` descending. Each `categories[i]` has `tasks: [...]` (also sorted by total desc), and each task has an `entries: [...]` array.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/stats.ts
git commit -m "feat(stats): add GET /by-category hierarchical endpoint"
```

---

## Task 8: Frontend API client + types

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Extend the inline `Entry` type and add API methods**

Modify `frontend/src/lib/api.ts`.

Add the `Category` type and helper near the other inline types (e.g. just above `EntryLink`):

```ts
export type Category = 'review' | 'bug' | 'refactor' | 'task' | 'daily';
export const CATEGORIES: Category[] = ['review', 'bug', 'refactor', 'task', 'daily'];
```

Update the `Entry` interface to include the new fields:

```ts
export interface Entry {
  id: number; project_id: number | null; task_id: number | null; project_name: string | null;
  github_repo: string | null; description: string | null;
  started_at: string; ended_at: string | null; duration_seconds: number | null;
  category: Category;
  category_manual: 0 | 1;
  links: EntryLink[]; badges: string[];
}
```

Add a `ByCategoryStats` type near the other interfaces (e.g. after `Plan`):

```ts
export interface ByCategoryStats {
  range: { from: string; to: string };
  total: number;
  categories: Array<{
    category: Category;
    total: number;
    tasks: Array<{
      task_id: number | null;
      task_name: string | null;
      total: number;
      entries: Array<{
        id: number;
        started_at: string;
        ended_at: string | null;
        duration_seconds: number;
        description: string | null;
      }>;
    }>;
  }>;
}
```

Add the new `entries.setCategory` method inside the `entries` block of the `api` object (after `removeLink`):

```ts
setCategory: (id: number, category: Category | null) =>
  request<{ entry: Entry }>(`/entries/${id}/category`, { method: 'PATCH', body: { category } }),
```

Add the new `stats.byCategory` method inside the `stats` block of the `api` object (after `get`):

```ts
byCategory: (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request<ByCategoryStats>(`/stats/by-category${qs ? `?${qs}` : ''}`);
},
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS (any errors should be in files we're about to touch in later tasks — list them but don't fix here).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): extend Entry, add setCategory and byCategory API"
```

---

## Task 9: `<CategoryBadge>` component

**Files:**
- Create: `frontend/src/components/CategoryBadge.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/CategoryBadge.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Category } from '../lib/api';
import { CATEGORIES } from '../lib/api';

interface CategoryBadgeProps {
  category: Category;
  manual: 0 | 1;
  onChange: (next: Category | null) => void;
}

export default function CategoryBadge({ category, manual, onChange }: CategoryBadgeProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(value: Category | null) {
    setOpen(false);
    onChange(value);
  }

  const label = `[${category}]${manual ? '*' : ''}`;

  return (
    <span ref={rootRef} className="category-badge" style={{ position: 'relative', display: 'inline-block', width: '11ch' }}>
      <button
        type="button"
        className="btn"
        style={{ fontFamily: 'inherit', padding: '0 2px', width: '100%', textAlign: 'left' }}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div
          className="category-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 10,
            background: 'var(--bg, #fff)',
            border: '1px solid currentColor',
            padding: 2,
            minWidth: '11ch',
          }}
        >
          {CATEGORIES.map((c) => (
            <div
              key={c}
              role="button"
              tabIndex={0}
              onClick={() => choose(c)}
              onKeyDown={(e) => { if (e.key === 'Enter') choose(c); }}
              style={{ padding: '2px 4px', cursor: 'pointer' }}
            >
              [{c}]
            </div>
          ))}
          <div
            role="button"
            tabIndex={0}
            onClick={() => choose(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') choose(null); }}
            style={{ padding: '2px 4px', cursor: 'pointer', borderTop: '1px dashed currentColor' }}
          >
            [auto]
          </div>
        </div>
      )}
    </span>
  );
}
```

Notes:
- The asterisk after the badge label (`[bug]*`) indicates a manual override is active. Removes itself after `[auto]`.
- Fixed width `11ch` keeps entry rows aligned (longest label is `[refactor]` = 10 chars; `*` makes it 11).
- Click-outside via `document` listener.

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CategoryBadge.tsx
git commit -m "feat(frontend): add CategoryBadge component with override dropdown"
```

---

## Task 10: Render `<CategoryBadge>` in `EntryItem`

**Files:**
- Modify: `frontend/src/components/EntryItem.tsx`

- [ ] **Step 1: Import and wire the badge**

Modify `frontend/src/components/EntryItem.tsx`.

Add the import near the top:

```ts
import CategoryBadge from './CategoryBadge';
import type { Category } from '../lib/api';
```

Inside the component, add a handler near `saveDescription`:

```ts
async function saveCategory(next: Category | null) {
  try {
    await api.entries.setCategory(entry.id, next);
    onChange?.();
  } catch (e) {
    showError(`! ${(e as Error).message}`);
  }
}
```

In the JSX, insert the badge between the project select and the description input. The current row JSX has:

```tsx
<select className="entry-proj-select" … >…</select>
<input className="entry-desc-input" … />
```

Add the badge between them:

```tsx
<select className="entry-proj-select" … >…</select>
<CategoryBadge
  category={entry.category}
  manual={entry.category_manual}
  onChange={saveCategory}
/>
<input className="entry-desc-input" … />
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Smoke-test in the browser**

With both servers running, open the EntriesPage. Each row should now show `[category]` (e.g. `[bug]`, `[review]`) between the project picker and the description.

- Click on a `[task]` badge → dropdown appears → pick `bug` → badge updates to `[bug]*` (note the asterisk).
- Reload the page → badge still `[bug]*`.
- Click again → pick `[auto]` → badge reverts to the auto-detected value (no asterisk).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/EntryItem.tsx
git commit -m "feat(frontend): show CategoryBadge on each entry row"
```

---

## Task 11: "By category" section on Dashboard

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Fetch and render the new data**

Modify `frontend/src/pages/DashboardPage.tsx`.

Add the import near the top:

```ts
import type { ByCategoryStats } from '../lib/api';
```

Add a second state hook alongside `stats`:

```ts
const [byCategory, setByCategory] = useState<ByCategoryStats | null>(null);
const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
```

Extend the existing `useEffect` that fetches stats to also fetch by-category:

```ts
useEffect(() => {
  const range = rangeForPeriod(period);
  api.stats.get(range).then((data) => setStats(data as StatsData));
  api.stats.byCategory(range).then((data) => setByCategory(data));
  // Reset expansion when period changes
  setExpandedCats(new Set());
  setExpandedTasks(new Set());
}, [period]);
```

Add helpers near the top of the component body:

```ts
function toggleCat(c: string) {
  setExpandedCats((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });
}

function toggleTask(key: string) {
  setExpandedTasks((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
}
```

In the JSX, insert a new section between the existing "By project" section and the `<hr className="rule" />` that separates it from "By day". The full new block:

```tsx
{byCategory && byCategory.categories.length > 0 && (
  <>
    <hr className="rule" />
    <div className="section-title">By category</div>
    {byCategory.categories.map((cat) => {
      const ratio = byCategory.total > 0 ? cat.total / byCategory.total : 0;
      const pct = Math.round(ratio * 100);
      const open = expandedCats.has(cat.category);
      return (
        <div key={cat.category}>
          <div
            className="dash-row"
            style={{ cursor: 'pointer' }}
            onClick={() => toggleCat(cat.category)}
          >
            <span className="name">{open ? '▾' : '▸'} [{cat.category}]</span>
            <span>{fmtDuration(cat.total)}</span>
            <AsciiBar ratio={ratio} />
            <span className="muted">{pct}%</span>
          </div>
          {open && cat.tasks.map((t) => {
            const taskKey = `${cat.category}:${t.task_id ?? 'null'}`;
            const taskOpen = expandedTasks.has(taskKey);
            return (
              <div key={taskKey} style={{ marginLeft: 16 }}>
                <div
                  className="dash-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleTask(taskKey)}
                >
                  <span className="name">{taskOpen ? '▾' : '▸'} {t.task_name ?? '(no task)'}</span>
                  <span>{fmtDuration(t.total)}</span>
                  <span></span>
                  <span></span>
                </div>
                {taskOpen && t.entries.map((e) => (
                  <div key={e.id} style={{ marginLeft: 32, fontSize: 12 }} className="dash-row">
                    <span className="muted">
                      {new Date(e.started_at).toLocaleString(undefined, {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{fmtDuration(e.duration_seconds)}</span>
                    <span className="name">{e.description ?? '(no description)'}</span>
                    <span></span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    })}
  </>
)}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Smoke-test in the browser**

With both servers running, open the Dashboard:

- The "By category" section appears between "By project" and "By day".
- Each category row shows `▸ [category]`, total duration, an ASCII bar, and a percentage.
- Clicking a category expands tasks (`▾`).
- Clicking a task expands entries with weekday + time.
- Switching the period (Day/Week/Month) refetches and collapses everything.
- An empty period (no entries) hides the entire section.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): add By-category drill-down section"
```

---

## Task 12: End-to-end smoke test from the spec

**Files:** none modified; this is a verification pass.

- [ ] **Step 1: Run the seven scenarios from the spec**

With both servers running and signed in:

1. **Auto-detect on create.** Start a timer with description `fix bug in login`. Stop it. EntriesPage row shows `[bug]` (no asterisk).
2. **Review keyword.** Start a timer with description `review PR #234`. Stop. Badge shows `[review]`.
3. **Empty description.** Start a timer with no description (or just task selected with a generic name like "Misc"). Stop. Badge shows `[task]` (assuming task name has no keywords).
4. **Priority.** Start a timer with description `review bug fix`. Badge shows `[review]` (review beats bug).
5. **Manual override sticks.** Click the badge of any entry → choose `refactor`. Badge becomes `[refactor]*`. Reload the page. Still `[refactor]*`.
6. **Reset to auto.** Click the same badge → choose `[auto]`. Badge reverts to the auto-detected category (no asterisk). Reload — still auto.
7. **Dashboard drill-down.** Open Dashboard with Week selected. Confirm:
   - "By category" section is present between "By project" and "By day".
   - Percentages across visible categories sum to ~100%.
   - Click a category → tasks list with totals.
   - Click a task → entries list with weekday + time.

- [ ] **Step 2: Run a final typecheck on both packages**

```bash
cd backend && npm run typecheck && cd ../frontend && npx tsc --noEmit && cd ..
```

Expected: PASS in both.

- [ ] **Step 3: Final commit**

If any small tweaks were made during smoke-testing:

```bash
git add -A
git status     # double-check nothing unexpected
git commit -m "chore: smoke-test fixes for entry categories"
```

If everything was clean from previous commits, skip this step.

---

## Self-review notes

Verified before submitting:

- **Spec coverage:** Each spec section maps to a task — data model (T1, T3), `categorize()` (T2), API entries.ts changes (T5, T6), API stats endpoint (T7), backfill (T3), `CategoryBadge` (T9, T10), Dashboard section (T11), verification checklist (T12). Timer also creates entries (covered in T4).
- **Type consistency:** `Category` is defined once in `shared/types/category.ts`, duplicated in `frontend/src/lib/api.ts` (intentional — frontend doesn't compile across `rootDir` to shared, per existing code comment). Both declare the same five values in the same order. `Entry` adds `category: Category` and `category_manual: 0 | 1` consistently in both places.
- **Method names:** `categorize` (single text), `categorizeEntry` (task name + description). `api.entries.setCategory(id, c|null)`, `api.stats.byCategory(range)`. Same names in every task that references them.
- **No placeholders:** every step contains the actual code or command.
