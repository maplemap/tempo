# Plan Categories — Design

**Date:** 2026-06-05
**Status:** Approved

## Goal

User-managed categories for plans in the Plans panel. Plans are grouped into
sections by category; uncategorized plans appear in a headerless section at the
top. Categories are created, renamed, and deleted directly in the panel.
Assigning a plan to a category happens by dragging it between sections.

## Backend

### Schema

New table in `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS plan_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Inline migration in `backend/src/db/index.ts` (project convention — idempotent
`try/catch`):

```js
try { db.exec(`ALTER TABLE plans ADD COLUMN category_id INTEGER REFERENCES plan_categories(id) ON DELETE SET NULL`); } catch {}
```

Existing plans get `category_id = NULL` → land in the uncategorized section.

### API

New route file `backend/src/routes/plan-categories.ts`, registered in
`server.ts` under `/api/plan-categories` (auth via `requireAuth` hook, same as
other routes):

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/` | — | List categories ordered by `position` |
| POST | `/` | `{ name }` | Create; `position = max + 1`; empty name → 400 |
| PATCH | `/:id` | `{ name?, position? }` | Rename / move; 404 if missing |
| DELETE | `/:id` | — | Explicit `UPDATE plans SET category_id = NULL WHERE category_id = ?`, then delete (don't rely on FK cascade — SQLite `foreign_keys` may be off) |

Changes in `backend/src/routes/plans.ts`:

- `PlanRow` gains `category_id: number | null`; SELECT unchanged (categories
  fetched separately, no JOIN needed)
- `PATCH /:id` accepts `category_id` (used by drag & drop between sections)
- `POST /` accepts optional `category_id` (UI doesn't send it yet)

Duplicate category names are allowed (single user, no UNIQUE constraint).

## Frontend

All changes in `frontend/src/components/PlansWidget.tsx`,
`frontend/src/lib/api.ts`, `frontend/src/styles.css`.

### API client

`api.planCategories` — `list` / `create` / `update` / `remove`; new type
`PlanCategory { id, name, position, created_at }`; `Plan` gains `category_id`.

### Panel layout (top to bottom)

1. "new plan..." add row — unchanged; new plans are created uncategorized
2. Uncategorized section — no header (as the whole list looks today)
3. Category sections — header (name + open-plan count, panel style:
   uppercase, 11–12px) followed by the category's plans
4. `[ + category ]` row below the last category — click turns it into an
   inline input; Enter creates, blur/empty cancels
5. Done plans — flat list at the bottom, NOT grouped by category (unchanged)

### Category header

- Click on the name → inline edit (input, save on blur/Enter — same pattern as
  plan text)
- `[ × ]` button → delete category; its plans move to the uncategorized
  section (optimistic local update). No confirm dialog — plans are not lost.
- Category order: by `position`, new ones appended. No category drag-reorder
  in v1 (`position` field exists; add later if needed).

### Drag & drop

- Single `DndContext` over the whole panel; each section is a droppable
  container (`useDroppable` so empty sections accept drops)
- Dropping a plan in another section: optimistic state update +
  `PATCH /api/plans/:id { category_id }` + existing `PATCH /api/plans/reorder`
  with the full ordered id list of open plans (position stays global; sections
  are concatenated in display order — the existing endpoint is reused as-is)
- Reordering within a section works as today

### CSS

New classes for section headers and the add-category row. Note: a
`.category-badge` class already exists in `styles.css` (used elsewhere) —
avoid name collisions; use e.g. `.plan-cat-header`, `.plan-cat-add`.

## Edge cases

- Empty category name: backend 400; frontend trims and skips the request
- Restoring a done plan returns it to its category (`category_id` is kept)
- Migration is idempotent; an old DB works with no manual steps
- Deleting a category while the panel is open: optimistic update — category
  disappears, its plans move to the uncategorized section locally

## Verification (no test suite — manual)

1. Create a category; create several
2. Drag a plan into a category, back out, into an empty category
3. Reorder plans within a section; reload — order and grouping persist
4. Rename a category inline
5. Delete a category that has plans → plans become uncategorized
6. Mark a categorized plan done → appears in flat done list; restore → returns
   to its category
7. Start with an existing DB → all old plans show uncategorized, no errors
