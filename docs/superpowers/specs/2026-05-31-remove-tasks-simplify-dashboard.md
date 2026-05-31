# Remove Tasks, Simplify Dashboard Grouping

**Date:** 2026-05-31  
**Status:** Approved

## Problem

The `tasks` table was intended to group `time_entries` by a unique (name, project_id) key and enable bulk rename. In practice it caused confusion:

- Entries created after the initial backfill often lacked `task_id`, landing in a `(NO TASK)` bucket in the Dashboard.
- The `(NO TASK)` bucket displayed individual entries without sub-grouping, producing many repetitive identical-looking rows.
- The `tasks` table added an extra concept (entity, CRUD route, join logic) with no clear benefit over simply using `description` text as the grouping key.

## Goal

- Remove `tasks` as a concept from the entire application.
- Group dashboard entries by `description` text — every entry already has one.
- Dashboard "By category" drill-down becomes: **category → description group → individual entries** (no intermediate task level).
- Bulk rename: editing an entry's description automatically renames all entries with the same old description.

## Data Model

**Removed:** `tasks` table.

**Migration (in `db/index.ts`):**
```sql
UPDATE time_entries SET task_id = NULL;
UPDATE plans SET task_id = NULL;
DROP TABLE IF EXISTS tasks;
```

`task_id` columns in `time_entries` and `plans` remain physically (SQLite does not support DROP COLUMN in older versions) but are always `NULL` going forward and are ignored by all application code.

`plans` become: `project_id + text + done + position` — no task linkage.

## Backend

### Remove `/api/tasks`
- Delete `backend/src/routes/tasks.ts`.
- Unregister the route in `server.ts`.

### `entries.ts` — bulk rename on description change
When `description` changes in `PATCH /api/entries/:id`, after updating the target entry, also update all other entries with the same old description:
```sql
UPDATE time_entries
SET description = ?
WHERE id != ? AND LOWER(TRIM(description)) = LOWER(TRIM(?))
```
Automatic, no confirmation prompt (single-user tool).

### `stats.ts` — rewrite `/by-category` grouping
Replace `task_id`-based grouping with `LOWER(TRIM(description ?? ''))` as the group key.

Response shape changes:
```ts
// before
{ task_id: number | null, task_name: string | null, total, entries }

// after
{ description: string | null, total, entries }
```

The `(no task)` intermediate level is eliminated. Category expands directly into description groups sorted by total descending.

### `categorize.ts`
Remove the `taskName` parameter from `categorizeEntry`. The function accepts only `description: string | null` going forward. Update all callers.

### `lib/api.ts` (frontend)
Update `ByCategoryStats` type to reflect the new response shape.

## Frontend

### `DashboardPage.tsx`
- Replace `task_id / task_name` with `description` as the group identifier and display label.
- Remove `expandedTasks` keyed by `task_id`; re-key by description text.
- Display `(no description)` for entries with null/empty description.

### Remove task-related UI
- Any component or API call referencing `/api/tasks` is removed.

## What Does NOT Change

- Categories (`category` column, `categorize.ts` rules, `category_manual` flag) — untouched.
- Plans feature — plans lose `task_id` linkage only; all other plan behavior (project link, done state, position) unchanged.
- "By category" three-level drill-down UX — same interaction, different group key.
- All other routes and pages.

## Git

All changes land on a dedicated branch (e.g. `feature/remove-tasks`), not directly on `main`.
