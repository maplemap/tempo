# Plans Mini-Widget — Design Spec

**Date:** 2026-05-26  
**Status:** Approved

## Overview

A backlog widget embedded in the Timer page. Lets the user queue up tasks per-project, reorder them by priority via drag-and-drop, and launch them directly into the active timer with one click.

---

## User-facing behaviour

### Widget placement

The Plans section appears below the timer on `TimerPage`, separated by a horizontal rule. It is always visible — no navigation needed.

### Header

```
PLANS  3 open · 2 done        [+ new]  [сховати done]
```

- `N open · N done` — live count, updates on every change
- `[+ new]` — opens inline add form at the top of the open list
- `[сховати done]` / `[показати done]` — toggles visibility of completed plans (state lives in component, not persisted)

### Open plans

Each open plan shows:
```
⠿  horizon · Fix login bug          [▶ run]
```

- `⠿` — drag handle, pointer cursor; drag reorders within open plans only
- Project name prefix for context
- `[▶ run]` — see Run behaviour below

Sorted by `position` ascending.

### Completed plans

Shown below open plans when visible:
```
   tempo · Setup CI          [▶ run]   ← greyed out, strikethrough text, no drag handle
```

- No drag handle (drag disabled)
- Sorted by `done_at` descending (most recent first)
- Persist forever; never auto-deleted

### Add form

Triggered by `[+ new]`. Appears inline above the open plan list:

```
[ horizon ▾ ]  [ опис задачі..._____________ ]  [add]  [×]
```

- Project dropdown (same list as timer, non-archived projects)
- Text input focused automatically on open
- `Enter` → submit (POST /api/plans) → form closes, plan appended at bottom of open list (position = max + 1)
- `Escape` → cancel, form closes
- Empty text → submit blocked

### Run behaviour

When `[▶ run]` is clicked on an open plan:

1. If a timer is running → `POST /api/timer/stop`
2. `POST /api/timer/start` with `{ project_id, description: plan.text }`
3. `PATCH /api/plans/:id` with `{ done: true }`
4. Plan moves to bottom of list with strikethrough; counters update

When `[▶ run]` is clicked on a done plan — re-runs it (starts timer) but does **not** change its done status.

### Drag-and-drop reorder

- Library: `@dnd-kit/sortable` (Pointer Events — works on touch/mobile)
- On drag end → `PATCH /api/plans/reorder` with `{ ids: [ordered list of open plan ids] }`
- Done plans are not draggable and not part of reorder payload
- Optimistic UI: reorder applied locally immediately, rolled back on API error

---

## Data model

New table in `backend/src/db/schema.sql`:

```sql
CREATE TABLE plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  text       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`position` is used only for open plans. On new plan insert, position = max(existing open positions) + 1 (appended at bottom).

---

## API

New file: `backend/src/routes/plans.ts`. Registered in `server.ts` under `requireAuth`.

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | /api/plans | — | `{ plans: Plan[] }` |
| POST | /api/plans | `{ project_id, text }` | `{ plan: Plan }` |
| PATCH | /api/plans/:id | `{ done?, text?, project_id? }` | `{ plan: Plan }` |
| PATCH | /api/plans/reorder | `{ ids: number[] }` | `{ ok: true }` |
| DELETE | /api/plans/:id | — | `{ ok: true }` |

`Plan` type:
```ts
interface Plan {
  id: number;
  project_id: number | null;
  project_name: string | null;
  text: string;
  position: number;
  done: 0 | 1;
  done_at: string | null;
  created_at: string;
}
```

GET response: open plans sorted by `position ASC`, done plans sorted by `done_at DESC`.

---

## Frontend

### New files

- `frontend/src/components/PlansWidget.tsx` — self-contained component, owns all Plans state and API calls
- Receives `projects: Project[]` as prop (already fetched by TimerPage)

### Modified files

- `frontend/src/lib/api.ts` — add `api.plans.*` (list, create, update, reorder, remove)
- `frontend/src/pages/TimerPage.tsx` — insert `<PlansWidget projects={projects} />` after the past-days section
- `backend/src/db/schema.sql` — add `plans` table
- `backend/src/db/index.ts` — no migration needed (new table created fresh via schema.sql on first run; existing DBs need inline ALTER — not applicable here since it's a new table, but schema apply logic must CREATE TABLE IF NOT EXISTS)
- `backend/src/server.ts` — register plans route
- `package.json` (frontend) — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

### State shape inside PlansWidget

```ts
plans: Plan[]          // all plans, open first then done
showDone: boolean      // toggle visibility of done plans
adding: boolean        // inline add form open
draft: { projectId: number | null; text: string }
```

---

## Edge cases

- **No projects**: `[+ new]` still works; project field shows empty/disabled
- **Run on done plan**: starts timer only, no state change to plan
- **Reorder API error**: roll back to server order on next fetch
- **Timer already stopped**: Run still works — just starts new timer
- **project deleted after plan created**: `project_id` may reference archived/deleted project; show project name as-is from JOIN, allow run (timer will use project_id as-is)
