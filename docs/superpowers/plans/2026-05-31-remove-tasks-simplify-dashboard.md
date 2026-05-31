# Remove Tasks, Simplify Dashboard Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `tasks` table and `task_id` FK, grouping Dashboard "By category" entries by description text instead; add bulk rename when editing an entry's description.

**Architecture:** Backend-first — migrate DB, simplify `categorize.ts`, clean routes in dependency order (categorize → db → timer → entries → stats → server), then update frontend types and components. All work on branch `feature/remove-tasks`.

**Tech Stack:** Node.js/TypeScript, Fastify 4, better-sqlite3, React 18/TSX, Vite

---

## File Map

| File | Action |
|---|---|
| `backend/src/lib/categorize.ts` | Remove `taskName` param from `categorizeEntry` |
| `backend/src/db/index.ts` | Add migration to null task_id, drop tasks table; remove task backfill; update `categorizeEntry` calls |
| `backend/src/routes/timer.ts` | Remove taskId param and task lookup; update `categorizeEntry` call |
| `backend/src/routes/entries.ts` | Remove task_id from PATCH; add bulk rename; update `categorizeEntry` calls |
| `backend/src/routes/stats.ts` | Rewrite `/by-category` to group by description text |
| `backend/src/routes/tasks.ts` | **Delete** |
| `backend/src/server.ts` | Remove tasks route import and registration |
| `frontend/src/lib/api.ts` | Remove `Task` type, `api.tasks`, `task_id` from Entry/TimerEntry/Plan; update `ByCategoryStats` |
| `frontend/src/pages/DashboardPage.tsx` | Rename `expandedTasks`→`expandedGroups`; render `cat.groups` by description |
| `frontend/src/pages/TimerPage.tsx` | Remove `tasks`/`selectedTask` state and task lookup; pass description directly |
| `frontend/src/components/PlansWidget.tsx` | Remove `findOrCreateTask`, all `api.tasks` calls, `task_id` from plan create/update |

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Create and switch to branch**

```bash
git checkout -b feature/remove-tasks
```

Expected: `Switched to a new branch 'feature/remove-tasks'`

---

## Task 2: Simplify `categorize.ts` — remove `taskName` parameter

**Files:**
- Modify: `backend/src/lib/categorize.ts`

- [ ] **Replace the `categorizeEntry` function signature and body**

Open `backend/src/lib/categorize.ts`. The current function:
```ts
export function categorizeEntry(
  taskName: string | null,
  description: string | null
): Category {
  return categorize([taskName, description].filter(Boolean).join(' '));
}
```

Replace with:
```ts
export function categorizeEntry(description: string | null): Category {
  return categorize(description ?? '');
}
```

- [ ] **Commit**

```bash
git add backend/src/lib/categorize.ts
git commit -m "refactor: remove taskName param from categorizeEntry"
```

---

## Task 3: DB migration — null out `task_id`, drop `tasks` table

**Files:**
- Modify: `backend/src/db/index.ts`

- [ ] **Remove the entire tasks backfill block and category backfill's `task_name` join**

In `backend/src/db/index.ts`, find and remove the entire block that starts with:
```ts
// Backfill: create tasks from unique (description, project_id) pairs in existing entries
const taskCount = (db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get() as { n: number }).n;
```
...through the closing `})();` and `console.log(...)` line. Delete all of it.

- [ ] **Add the tasks-removal migration after the existing `ALTER TABLE` lines**

After the last `try { db.exec(...) } catch {}` block, add:

```ts
// Remove tasks: null out FKs, then drop the table
try {
  db.exec(`UPDATE time_entries SET task_id = NULL`);
  db.exec(`UPDATE plans SET task_id = NULL`);
  db.exec(`DROP TABLE IF EXISTS tasks`);
} catch {}
```

- [ ] **Fix the category backfill query — remove task join**

Find the category backfill block. It currently queries:
```ts
const rows = db.prepare(`
  SELECT e.id, e.description, t.name AS task_name
  FROM time_entries e
  LEFT JOIN tasks t ON t.id = e.task_id
`).all() as Array<{ id: number; description: string | null; task_name: string | null }>;
```

Replace with:
```ts
const rows = db.prepare(`
  SELECT id, description FROM time_entries
`).all() as Array<{ id: number; description: string | null }>;
```

And fix the `updateCategory.run` call inside the loop:
```ts
// before
updateCategory.run(categorizeEntry(r.task_name, r.description), r.id);
// after
updateCategory.run(categorizeEntry(r.description), r.id);
```

- [ ] **Verify the server starts**

```bash
cd /Users/maplemap/Work/Projects/_own-projects/tempo
npm run dev
```

Expected: server starts without errors, `[db] using ...tempo.db` printed, no crash.

Stop the server with Ctrl+C.

- [ ] **Commit**

```bash
git add backend/src/db/index.ts
git commit -m "feat: migrate DB — drop tasks table, remove task backfill"
```

---

## Task 4: Clean up `timer.ts` — remove task lookup

**Files:**
- Modify: `backend/src/routes/timer.ts`

- [ ] **Remove `task_id` from `TimerRow` interface**

Find:
```ts
interface TimerRow {
  id: number;
  project_id: number | null;
  task_id: number | null;
```
Replace with:
```ts
interface TimerRow {
  id: number;
  project_id: number | null;
```

- [ ] **Remove `taskId` from `InsertParams` and the `insertEntry` prepared statement**

Find:
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
Replace with:
```ts
interface InsertParams {
  projectId: number | null;
  description: string;
  startedAt: string;
  category: Category;
}
const insertEntry = db.prepare<InsertParams>(`
  INSERT INTO time_entries (project_id, description, started_at, category, category_manual)
  VALUES (@projectId, @description, @startedAt, @category, 0)
`);
```

- [ ] **Simplify the `/start` POST handler body**

Find the route handler:
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
```

Replace with:
```ts
fastify.post<{ Body: { projectId?: number | null; description?: string } }>(
  '/start',
  async (req) => {
    const { projectId = null, description = '' } = req.body;
    const category = categorizeEntry(description);

    closeAllOpen.run({ endedAt: nowIso() });
    const result = insertEntry.run({
      projectId: projectId ?? null,
      description,
      startedAt: nowIso(),
      category,
    });
```

- [ ] **Commit**

```bash
git add backend/src/routes/timer.ts
git commit -m "refactor: remove task lookup from timer start"
```

---

## Task 5: Update `entries.ts` — remove `task_id`, add bulk rename

**Files:**
- Modify: `backend/src/routes/entries.ts`

- [ ] **Remove `task_id` from `DbEntry` interface**

Find:
```ts
interface DbEntry {
  id: number;
  project_id: number | null;
  task_id: number | null;
  description: string | null;
```
Replace with:
```ts
interface DbEntry {
  id: number;
  project_id: number | null;
  description: string | null;
```

- [ ] **Simplify the PATCH handler — remove task_id logic and category task lookup**

Find the section in the PATCH handler:
```ts
    // Recompute category only if not manually overridden AND description/task_id changed.
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
```
Replace with:
```ts
    let nextCategory: Category = current.category;
    if (!current.category_manual && next.description !== current.description) {
      nextCategory = categorizeEntry(next.description ?? null);
    }
```

- [ ] **Update the UPDATE prepared statement to remove `task_id`**

Find:
```ts
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
```
Replace with:
```ts
    db.prepare<{
      id: number; project_id: number | null; description: string;
      started_at: string; ended_at: string | null; duration_seconds: number | null; category: Category;
    }>(`
      UPDATE time_entries
      SET project_id = @project_id,
          description = @description,
          started_at = @started_at,
          ended_at = @ended_at,
          duration_seconds = @duration_seconds,
          category = @category
      WHERE id = @id
    `).run({
      id: current.id,
      project_id: next.project_id ?? null,
      description: next.description ?? '',
      started_at: startedAt,
      ended_at: endedAt ?? null,
      duration_seconds: duration,
      category: nextCategory,
    });
```

- [ ] **Add bulk rename immediately after the UPDATE**

Add the following block right after the `.run({...})` call and before the `autoLinkPRs` call:

```ts
    // Bulk rename: update all other entries with the same old description
    if (next.description !== current.description && next.description && current.description) {
      const newCat = categorizeEntry(next.description);
      db.prepare(`
        UPDATE time_entries
        SET description = ?,
            category = CASE WHEN category_manual = 0 THEN ? ELSE category END
        WHERE id != ? AND LOWER(TRIM(description)) = LOWER(TRIM(?))
      `).run(next.description, newCat, current.id, current.description);
    }
```

- [ ] **Fix the category reset endpoint — remove task lookup**

Find:
```ts
        const task = current.task_id
          ? db.prepare<[number], { name: string }>(`SELECT name FROM tasks WHERE id = ?`).get(current.task_id)
          : null;
        const auto = categorizeEntry(task?.name ?? null, current.description);
```
Replace with:
```ts
        const auto = categorizeEntry(current.description);
```

- [ ] **Commit**

```bash
git add backend/src/routes/entries.ts
git commit -m "feat: bulk rename entries, remove task_id from entries route"
```

---

## Task 6: Rewrite `stats.ts` `/by-category` grouping

**Files:**
- Modify: `backend/src/routes/stats.ts`

- [ ] **Remove the task join from `entriesForByCategory` query and its interface**

Find and replace the entire `ByCategoryRow` interface and `entriesForByCategory` prepared statement:

```ts
// BEFORE — remove this:
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

Replace with:
```ts
interface ByCategoryRow {
  category: Category;
  entry_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  description: string | null;
}

const entriesForByCategory = db.prepare<RangeParams, ByCategoryRow>(`
  SELECT
    e.category                      AS category,
    e.id                            AS entry_id,
    e.started_at                    AS started_at,
    e.ended_at                      AS ended_at,
    COALESCE(e.duration_seconds, 0) AS duration_seconds,
    e.description                   AS description
  FROM time_entries e
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso AND e.duration_seconds IS NOT NULL
  ORDER BY e.started_at DESC
`);
```

- [ ] **Rewrite the `/by-category` route handler**

Find the entire `/by-category` route and replace:

```ts
  fastify.get<{ Querystring: { from?: string; to?: string } }>('/by-category', async (req) => {
    const { from, to } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const rows = entriesForByCategory.all({ fromIso, toIso });

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

Replace with:
```ts
  fastify.get<{ Querystring: { from?: string; to?: string } }>('/by-category', async (req) => {
    const { from, to } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const rows = entriesForByCategory.all({ fromIso, toIso });

    interface EntryOut {
      id: number;
      started_at: string;
      ended_at: string | null;
      duration_seconds: number;
      description: string | null;
    }
    interface GroupOut {
      description: string | null;
      total: number;
      entries: EntryOut[];
    }
    interface CategoryOut {
      category: Category;
      total: number;
      groups: GroupOut[];
    }

    const catMap = new Map<Category, Map<string, GroupOut>>();
    let grandTotal = 0;

    for (const r of rows) {
      grandTotal += r.duration_seconds;
      if (!catMap.has(r.category)) catMap.set(r.category, new Map());
      const groupKey = (r.description ?? '').toLowerCase().trim() || '\x00';
      const groupMap = catMap.get(r.category)!;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { description: r.description, total: 0, entries: [] });
      }
      const g = groupMap.get(groupKey)!;
      g.total += r.duration_seconds;
      g.entries.push({
        id: r.entry_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        duration_seconds: r.duration_seconds,
        description: r.description,
      });
    }

    const categories: CategoryOut[] = [...catMap.entries()].map(([category, groupMap]) => {
      const groups = [...groupMap.values()].sort((a, b) => b.total - a.total);
      const total = groups.reduce((s, g) => s + g.total, 0);
      return { category, total, groups };
    }).sort((a, b) => b.total - a.total);

    return {
      range: { from: fromIso, to: toIso },
      total: grandTotal,
      categories,
    };
  });
```

- [ ] **Commit**

```bash
git add backend/src/routes/stats.ts
git commit -m "feat: group by-category stats by description text, drop task join"
```

---

## Task 7: Delete `tasks.ts` route and unregister from `server.ts`

**Files:**
- Delete: `backend/src/routes/tasks.ts`
- Modify: `backend/src/server.ts`

- [ ] **Delete the file**

```bash
rm backend/src/routes/tasks.ts
```

- [ ] **Remove import and registration from `server.ts`**

Open `backend/src/server.ts`. Remove:
```ts
import tasksRoutes from './routes/tasks.js';
```
and:
```ts
await app.register(tasksRoutes,   { prefix: '/api/tasks' });
```

- [ ] **Verify backend compiles and starts**

```bash
npm run dev
```

Expected: server starts, no TypeScript errors, no `[tasks]` log lines.

Stop with Ctrl+C.

- [ ] **Commit**

```bash
git add backend/src/server.ts
git rm backend/src/routes/tasks.ts
git commit -m "feat: remove /api/tasks route"
```

---

## Task 8: Update frontend types in `api.ts`

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Remove `Task` interface and `api.tasks` object**

Delete the `Task` interface:
```ts
export interface Task {
  id: number; name: string; project_id: number | null; created_at: string;
}
```

Delete the entire `tasks` block from the `api` object:
```ts
  tasks: {
    list:   () => request<{ tasks: Task[] }>('/tasks'),
    create: (body: { name: string; project_id?: number | null }) =>
      request<{ task: Task }>('/tasks', { method: 'POST', body }),
    update: (id: number, body: { name?: string; project_id?: number | null }) =>
      request<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' })
  }
```

- [ ] **Remove `task_id` from `Entry`, `TimerEntry`, and `Plan` interfaces**

`Entry`: remove `task_id: number | null;`
`TimerEntry`: remove `task_id: number | null;`
`Plan`: remove `task_id: number | null;`

- [ ] **Update `ByCategoryStats` — replace `tasks` array with `groups`**

Find:
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

Replace with:
```ts
export interface ByCategoryStats {
  range: { from: string; to: string };
  total: number;
  categories: Array<{
    category: Category;
    total: number;
    groups: Array<{
      description: string | null;
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

- [ ] **Update `api.timer.start` body type**

Find:
```ts
    start:   (body: { projectId?: number | null; taskId?: number | null; description?: string }) =>
```
Replace with:
```ts
    start:   (body: { projectId?: number | null; description?: string }) =>
```

- [ ] **Update `api.plans.create` and `api.plans.update` body types**

`create`: remove `task_id?: number | null;` from body type
`update`: remove `task_id?: number | null;` from body type

- [ ] **Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "refactor: remove Task type and api.tasks from frontend api"
```

---

## Task 9: Update `DashboardPage.tsx`

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Rename `expandedTasks` state to `expandedGroups` and update toggle function**

Find:
```ts
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
```
Replace with:
```ts
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
```

Find:
```ts
  function toggleTask(key: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
```
Replace with:
```ts
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
```

Find in the `useEffect`:
```ts
    setExpandedTasks(new Set());
```
Replace with:
```ts
    setExpandedGroups(new Set());
```

- [ ] **Replace the By category drill-down render block**

Find:
```tsx
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
```

Replace with:
```tsx
                {open && cat.groups.map((g) => {
                  const groupKey = `${cat.category}:${(g.description ?? '').toLowerCase().trim() || '__empty__'}`;
                  const groupOpen = expandedGroups.has(groupKey);
                  return (
                    <div key={groupKey} style={{ marginLeft: 16 }}>
                      <div
                        className="dash-row"
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleGroup(groupKey)}
                      >
                        <span className="name">{groupOpen ? '▾' : '▸'} {g.description ?? '(no description)'}</span>
                        <span>{fmtDuration(g.total)}</span>
                        <span></span>
                        <span></span>
                      </div>
                      {groupOpen && g.entries.map((e) => (
                        <div key={e.id} style={{ marginLeft: 32, fontSize: 12 }} className="dash-row">
                          <span className="muted">
                            {new Date(e.started_at).toLocaleString(undefined, {
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span>{fmtDuration(e.duration_seconds)}</span>
                          <span></span>
                          <span></span>
                        </div>
                      ))}
                    </div>
                  );
                })}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: render by-category groups by description text"
```

---

## Task 10: Update `TimerPage.tsx` — remove tasks state

**Files:**
- Modify: `frontend/src/pages/TimerPage.tsx`

- [ ] **Remove `Task` from the import**

Find:
```ts
import type { Entry, Project, Task, TimerEntry } from '../lib/api';
```
Replace with:
```ts
import type { Entry, Project, TimerEntry } from '../lib/api';
```

- [ ] **Remove tasks-related state declarations**

Remove these two `useState` lines (keep `taskText` — it's the description input):
```ts
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
```

- [ ] **Remove `api.tasks.list()` from `loadData`**

Find the `Promise.all` in `loadData`:
```ts
    const [{ current: timerCurrent }, { projects: prjs }, { tasks: tks }, { entries: ents }] = await Promise.all([
      api.timer.current(),
      api.projects.list(),
      api.tasks.list(),
      api.entries.list(...),
    ]);
```
Replace with:
```ts
    const [{ current: timerCurrent }, { projects: prjs }, { entries: ents }] = await Promise.all([
      api.timer.current(),
      api.projects.list(),
      api.entries.list(...),
    ]);
```
Remove `setTasks(tks);` and the task-id lookup block:
```ts
      if (timerCurrent.task_id) {
        const t = tks.find((t) => t.id === timerCurrent.task_id) ?? null;
        setSelectedTask(t);
      }
```

- [ ] **Simplify `startTimer` to use description text directly**

Find the section in `startTimer` that does task lookup/creation:
```ts
    let task = selectedTask ?? tasks.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.project_id === pid
    ) ?? null;

    if (!task) {
      const { task: created } = await api.tasks.create({ name: trimmed, project_id: pid });
      setTasks((prev) => [...prev, created]);
      task = created;
    }

    const res = await api.timer.start({ projectId: pid, taskId: task.id });
```
Replace with:
```ts
    const res = await api.timer.start({ projectId: pid, description: trimmed });
```

- [ ] **Remove `setSelectedTask(null)` from the stop/reset logic**

Search for `setSelectedTask(null)` and remove those lines.

- [ ] **Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Fix any remaining type errors related to tasks/task_id.

- [ ] **Commit**

```bash
git add frontend/src/pages/TimerPage.tsx
git commit -m "refactor: remove tasks from TimerPage, start timer by description"
```

---

## Task 11: Update `PlansWidget.tsx` — remove task logic

**Files:**
- Modify: `frontend/src/components/PlansWidget.tsx`

- [ ] **Remove `Task` import and task-related state/props from all three components**

Remove `Task` from the import line.

In `SortableItemProps` (around line 31), remove:
```ts
  tasks: Task[];
  // ...
  onTasksChange: (tasks: Task[]) => void;
```

In `SortableItem` function signature, remove `tasks` and `onTasksChange` params.

In `AddRowProps` (around line 107), remove:
```ts
  tasks: Task[];
  // ...
  onTasksChange: (tasks: Task[]) => void;
```

In `AddRow` function signature, remove `tasks` and `onTasksChange` params.

In `PlansWidget`:
- Remove `const [tasks, setTasks] = useState<Task[]>([]);`
- Remove `tasks={tasks}` and `onTasksChange={setTasks}` from `<AddRow>` JSX
- Remove `tasks={tasks}` and `onTasksChange={setTasks}` from `<SortableItem>` JSX

- [ ] **Remove `findOrCreateTask` helper function entirely**

Delete the entire `findOrCreateTask` function.

- [ ] **Simplify `SortableItem` save logic**

Find the save handler in `SortableItem` that does:
```ts
      if (plan.task_id) {
        await api.tasks.update(plan.task_id, { name: trimmed });
      } else {
        const existing = findOrCreateTask(tasks, trimmed, pid);
        if (existing) {
          const { plan: updated } = await api.plans.update(plan.id, { task_id: existing.id, text: trimmed });
          onUpdate(plan.id, { task_id: updated.task_id, text: updated.text });
        } else {
          const { task } = await api.tasks.create({ name: trimmed, project_id: pid });
          onTasksChange([...tasks, task]);
          const { plan: updated } = await api.plans.update(plan.id, { task_id: task.id, text: trimmed });
          onUpdate(plan.id, { task_id: updated.task_id, text: updated.text });
        }
      }
```
Replace with:
```ts
      const { plan: updated } = await api.plans.update(plan.id, { text: trimmed });
      onUpdate(plan.id, { text: updated.text });
```

- [ ] **Simplify `AddRow` submit logic**

Find in `AddRow`:
```ts
    const existing = findOrCreateTask(tasks, trimmed, pid);
    let taskId: number;
    if (existing) {
      taskId = existing.id;
    } else {
      const { task } = await api.tasks.create({ name: trimmed, project_id: pid });
      onTasksChange([...tasks, task]);
      taskId = task.id;
    }
    const { plan } = await api.plans.create({ project_id: pid, task_id: taskId, text: trimmed });
```
Replace with:
```ts
    const { plan } = await api.plans.create({ project_id: pid, text: trimmed });
```

- [ ] **Fix `handleRun` — remove the `task_id` branch**

Find in `PlansWidget`:
```ts
    if (plan.task_id) {
      await api.timer.start({ projectId: plan.project_id, taskId: plan.task_id });
    } else {
      await api.timer.start({ projectId: plan.project_id, description: plan.text });
    }
```
Replace with:
```ts
    await api.timer.start({ projectId: plan.project_id, description: plan.text });
```

- [ ] **Remove `api.tasks.list()` from the widget's data load**

Find:
```ts
    const [{ plans: p }, { projects: prjs }, { tasks: tks }] = await Promise.all([
      api.plans.list(),
      api.projects.list(),
      api.tasks.list(),
    ]);
```
Replace with:
```ts
    const [{ plans: p }, { projects: prjs }] = await Promise.all([
      api.plans.list(),
      api.projects.list(),
    ]);
```
Remove `setTasks(tks)`.

- [ ] **Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add frontend/src/components/PlansWidget.tsx
git commit -m "refactor: remove task logic from PlansWidget"
```

---

## Task 12: End-to-end smoke test

- [ ] **Start the dev server**

```bash
cd /Users/maplemap/Work/Projects/_own-projects/tempo
npm run dev
```

- [ ] **Verify Dashboard "By category"**

Open the app in a browser. Go to Dashboard. Expand a category. Confirm:
- No `(no task)` group exists
- Entries with the same description are grouped under one collapsible row showing total time
- Expanding a description group shows individual entries with timestamps

- [ ] **Verify bulk rename**

Go to Entries. Edit the description of one entry that has duplicates (same text on multiple entries). Save. Confirm all other entries with the same old description now show the new description.

- [ ] **Verify timer start**

Go to TimerPage. Type a description, start the timer. Confirm it starts without errors and the description is saved correctly.

- [ ] **Verify plans**

Go to the plans widget. Add a plan, rename it, run it (start timer from plan). Confirm timer starts with the plan's text as description.

- [ ] **Final commit**

```bash
git add -A
git status  # confirm nothing unexpected is staged
git commit -m "chore: smoke test passed — remove-tasks feature complete"
```
