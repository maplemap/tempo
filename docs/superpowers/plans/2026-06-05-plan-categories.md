# Plan Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-managed categories for plans — grouped sections in the Plans panel with drag & drop between them.

**Architecture:** New `plan_categories` table + nullable `category_id` on `plans`. New CRUD route `/api/plan-categories`. The Plans panel renders one droppable section per category (uncategorized first, headerless); the existing global-position reorder endpoint is reused — sections are concatenated in display order.

**Tech Stack:** Fastify 4 + better-sqlite3 (backend), React 18 + @dnd-kit (frontend). TypeScript strict everywhere. **No test suite in this project** (per CLAUDE.md) — each task is verified by typecheck + manual checks against the running app.

**Spec:** `docs/superpowers/specs/2026-06-05-plan-categories-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `backend/src/db/schema.sql` | Modify | New `plan_categories` table |
| `backend/src/db/index.ts` | Modify | Idempotent `ALTER TABLE plans ADD COLUMN category_id` |
| `backend/src/routes/plan-categories.ts` | Create | CRUD for categories |
| `backend/src/server.ts` | Modify | Register the new route |
| `backend/src/routes/plans.ts` | Modify | `category_id` in row type, INSERT, UPDATE, handlers |
| `frontend/src/lib/api.ts` | Modify | `PlanCategory` type, `api.planCategories`, `Plan.category_id` |
| `frontend/src/components/PlansWidget.tsx` | Modify | Sections, category header, add-category row, cross-section DnD |
| `frontend/src/styles.css` | Modify | Section header / add-row styles (note: `.category-badge` already exists for *entry* categories — do not reuse; prefix new classes `plan-cat-`) |

---

### Task 1: Backend — schema and migration

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.ts`

- [ ] **Step 1: Add the table to schema.sql**

Append to `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS plan_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Add the inline migration to db/index.ts**

⚠️ Placement matters: the migration MUST go **after** the "Rebuild plans without task_id→tasks FK" block (the `if (planFkCount > 0) { ... }` block ending around line 93). That block does `INSERT INTO plans_new SELECT * FROM plans`, which assumes the old column set — adding `category_id` before it would break the column-count match on a DB that hasn't been rebuilt yet.

Insert after that block:

```ts
try { db.exec(`ALTER TABLE plans ADD COLUMN category_id INTEGER REFERENCES plan_categories(id) ON DELETE SET NULL`); } catch {}
```

- [ ] **Step 3: Typecheck and boot check**

Run: `cd backend && npm run typecheck`
Expected: exit 0, no output.

Run: `cd backend && timeout 10 npx tsx src/server.ts; true` (needs `.env` with `ADMIN_PASSWORD`/`JWT_SECRET` — already present for dev)
Expected: `[db] using .../backend/data/tempo.db` and `[tempo] listening on :3001` with no exceptions.

Run: `sqlite3 backend/data/tempo.db "PRAGMA table_info(plans);" | grep category_id`
Expected: a row like `8|category_id|INTEGER|0||0`.

- [ ] **Step 4: Commit (include the spec doc, which is not yet committed)**

```bash
git add docs/superpowers/specs/2026-06-05-plan-categories-design.md docs/superpowers/plans/2026-06-05-plan-categories.md backend/src/db/schema.sql backend/src/db/index.ts
git commit -m "feat: add plan_categories table and plans.category_id migration"
```

---

### Task 2: Backend — plan-categories CRUD route

**Files:**
- Create: `backend/src/routes/plan-categories.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Create the route file**

`backend/src/routes/plan-categories.ts` — full content:

```ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

interface CategoryRow {
  id: number;
  name: string;
  position: number;
  created_at: string;
}

const listAll = db.prepare<[], CategoryRow>(`
  SELECT * FROM plan_categories ORDER BY position ASC, id ASC
`);

const getOne = db.prepare<[number], CategoryRow>(`
  SELECT * FROM plan_categories WHERE id = ?
`);

const maxPos = db.prepare<[], { max: number | null }>(`
  SELECT MAX(position) AS max FROM plan_categories
`);

const insertCategory = db.prepare<{ name: string; position: number }>(`
  INSERT INTO plan_categories (name, position) VALUES (@name, @position)
`);

const updateCategory = db.prepare<{ name: string; position: number; id: number }>(`
  UPDATE plan_categories SET name = @name, position = @position WHERE id = @id
`);

const clearPlans = db.prepare<[number]>(`UPDATE plans SET category_id = NULL WHERE category_id = ?`);
const removeCategory = db.prepare<[number]>(`DELETE FROM plan_categories WHERE id = ?`);

export default async function planCategoriesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ categories: listAll.all() }));

  fastify.post<{ Body: { name: string } }>('/', async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: 'name required' });
    const max = maxPos.get()?.max ?? -1;
    const result = insertCategory.run({ name, position: max + 1 });
    return { category: getOne.get(Number(result.lastInsertRowid)) };
  });

  fastify.patch<{ Params: { id: string }; Body: { name?: string; position?: number } }>(
    '/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = getOne.get(id);
      if (!existing) return reply.code(404).send({ error: 'not found' });
      const name = req.body.name !== undefined ? req.body.name.trim() : existing.name;
      if (!name) return reply.code(400).send({ error: 'name required' });
      const position = req.body.position ?? existing.position;
      updateCategory.run({ name, position, id });
      return { category: getOne.get(id) };
    }
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getOne.get(id)) return reply.code(404).send({ error: 'not found' });
    // Explicitly null out plans first — don't rely on the FK cascade.
    db.transaction(() => {
      clearPlans.run(id);
      removeCategory.run(id);
    })();
    return { ok: true };
  });
}
```

- [ ] **Step 2: Register the route in server.ts**

Add the import after the `plansRoutes` import (line 21):

```ts
import planCategoriesRoutes from './routes/plan-categories.js';
```

Add the registration after the `plansRoutes` registration (line 39):

```ts
await app.register(planCategoriesRoutes, { prefix: '/api/plan-categories' });
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Smoke-test the endpoints**

With the dev server running (`npm run dev` from repo root), in another terminal:

```bash
# login → cookie jar
curl -s -c /tmp/tempo.jar -H 'content-type: application/json' \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" http://localhost:3001/api/auth/login
# create
curl -s -b /tmp/tempo.jar -H 'content-type: application/json' \
  -d '{"name":"Work"}' -X POST http://localhost:3001/api/plan-categories
# list
curl -s -b /tmp/tempo.jar http://localhost:3001/api/plan-categories
# rename (use the id from the create response)
curl -s -b /tmp/tempo.jar -H 'content-type: application/json' \
  -d '{"name":"Werk"}' -X PATCH http://localhost:3001/api/plan-categories/1
# delete
curl -s -b /tmp/tempo.jar -X DELETE http://localhost:3001/api/plan-categories/1
```

Expected: create returns `{"category":{"id":1,"name":"Work","position":0,...}}`; list shows it; PATCH returns the renamed category; DELETE returns `{"ok":true}`; empty `name` returns 400.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/plan-categories.ts backend/src/server.ts
git commit -m "feat: plan categories CRUD route"
```

---

### Task 3: Backend — category_id on plans

**Files:**
- Modify: `backend/src/routes/plans.ts`

- [ ] **Step 1: Extend PlanRow (line 5-15)**

Add to the `PlanRow` interface after `task_id`:

```ts
  category_id: number | null;
```

- [ ] **Step 2: Extend insertPlan (line 35-37)**

Replace with:

```ts
const insertPlan = db.prepare<{ projectId: number | null; taskId: number | null; categoryId: number | null; text: string; position: number }>(`
  INSERT INTO plans (project_id, task_id, category_id, text, position)
  VALUES (@projectId, @taskId, @categoryId, @text, @position)
`);
```

- [ ] **Step 3: Extend updatePlan (line 39-45)**

Replace with:

```ts
const updatePlan = db.prepare<{
  done: number; doneAt: string | null; text: string;
  projectId: number | null; taskId: number | null; categoryId: number | null; id: number;
}>(`
  UPDATE plans SET done = @done, done_at = @doneAt, text = @text,
    project_id = @projectId, task_id = @taskId, category_id = @categoryId WHERE id = @id
`);
```

- [ ] **Step 4: Extend the POST handler (line 58-72)**

Body type gains `category_id?: number | null`. Destructure and pass it:

```ts
  fastify.post<{ Body: { project_id?: number | null; task_id?: number | null; category_id?: number | null; text: string } }>(
    '/',
    async (req, reply) => {
      const { project_id = null, task_id = null, category_id = null, text } = req.body;
      if (!text?.trim()) return reply.code(400).send({ error: 'text required' });
      const max = maxOpenPos.get()?.max ?? -1;
      const result = insertPlan.run({
        projectId: project_id ?? null,
        taskId: task_id ?? null,
        categoryId: category_id ?? null,
        text: text.trim(),
        position: max + 1,
      });
      return { plan: getOne.get(Number(result.lastInsertRowid)) };
    }
  );
```

- [ ] **Step 5: Extend the PATCH handler (line 83-102)**

Body type gains `category_id?: number | null`. Add next to the `taskId` line and pass to `updatePlan.run`:

```ts
  fastify.patch<{
    Params: { id: string };
    Body: { done?: boolean; text?: string; project_id?: number | null; task_id?: number | null; category_id?: number | null };
  }>(
    '/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = getOne.get(id);
      if (!existing) return reply.code(404).send({ error: 'not found' });

      const done       = req.body.done !== undefined ? (req.body.done ? 1 : 0) : existing.done;
      const doneAt     = done && !existing.done ? new Date().toISOString() : (done ? existing.done_at : null);
      const text       = req.body.text ?? existing.text;
      const projectId  = req.body.project_id !== undefined ? req.body.project_id : existing.project_id;
      const taskId     = req.body.task_id !== undefined ? req.body.task_id : existing.task_id;
      const categoryId = req.body.category_id !== undefined ? req.body.category_id : existing.category_id;

      updatePlan.run({ done, doneAt, text, projectId: projectId ?? null, taskId: taskId ?? null, categoryId: categoryId ?? null, id });
      return { plan: getOne.get(id) };
    }
  );
```

- [ ] **Step 6: Typecheck and smoke-test**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

```bash
curl -s -b /tmp/tempo.jar -H 'content-type: application/json' \
  -d '{"text":"test plan"}' -X POST http://localhost:3001/api/plans
# → plan with "category_id":null
curl -s -b /tmp/tempo.jar -H 'content-type: application/json' \
  -d '{"category_id":1}' -X PATCH http://localhost:3001/api/plans/<id>
# → plan with "category_id":1 (create category 1 first if needed)
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/plans.ts
git commit -m "feat: category_id support on plans API"
```

---

### Task 4: Frontend — API client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the PlanCategory type and extend Plan (line 32-35)**

```ts
export interface Plan {
  id: number; project_id: number | null; project_name: string | null;
  category_id: number | null;
  text: string; position: number; done: 0 | 1; done_at: string | null; created_at: string;
}
export interface PlanCategory {
  id: number; name: string; position: number; created_at: string;
}
```

- [ ] **Step 2: Extend api.plans and add api.planCategories (line 138-148)**

Replace the `plans` block and add `planCategories` after it:

```ts
  plans: {
    list:    () => request<{ plans: Plan[] }>('/plans'),
    create:  (body: { project_id?: number | null; category_id?: number | null; text: string }) =>
      request<{ plan: Plan }>('/plans', { method: 'POST', body }),
    update:  (id: number, body: { done?: boolean; text?: string; project_id?: number | null; category_id?: number | null }) =>
      request<{ plan: Plan }>(`/plans/${id}`, { method: 'PATCH', body }),
    reorder: (ids: number[]) =>
      request<{ ok: boolean }>('/plans/reorder', { method: 'PATCH', body: { ids } }),
    remove:  (id: number) =>
      request<{ ok: boolean }>(`/plans/${id}`, { method: 'DELETE' })
  },
  planCategories: {
    list:   () => request<{ categories: PlanCategory[] }>('/plan-categories'),
    create: (name: string) =>
      request<{ category: PlanCategory }>('/plan-categories', { method: 'POST', body: { name } }),
    update: (id: number, body: { name?: string; position?: number }) =>
      request<{ category: PlanCategory }>(`/plan-categories/${id}`, { method: 'PATCH', body }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/plan-categories/${id}`, { method: 'DELETE' })
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: planCategories API client"
```

---

### Task 5: Frontend — sections, category management, cross-section DnD

**Files:**
- Modify: `frontend/src/components/PlansWidget.tsx`

- [ ] **Step 1: Add imports**

Add `useDroppable` to the `@dnd-kit/core` import and `PlanCategory` to the api types import:

```ts
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
// ...
import type { Plan, PlanCategory, Project } from '../lib/api';
```

- [ ] **Step 2: Add the three new components (above PlansWidget, after AddRow)**

```tsx
function SectionDroppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef} className="plan-section">{children}</div>;
}

interface CategoryHeaderProps {
  category: PlanCategory;
  count: number;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (category: PlanCategory) => void;
}

function CategoryHeader({ category, count, onRename, onDelete }: CategoryHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  useEffect(() => { setName(category.name); }, [category.name]);

  async function save() {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) { setName(category.name); return; }
    await onRename(category.id, trimmed);
  }

  return (
    <div className="plan-cat-header">
      {editing ? (
        <input
          className="plan-cat-name-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setName(category.name); setEditing(false); }
          }}
        />
      ) : (
        <span className="plan-cat-name" title={category.name} onClick={() => setEditing(true)}>
          {category.name}
        </span>
      )}
      <span className="plan-cat-count">{count}</span>
      <button className="btn icon-btn" onClick={() => onDelete(category)}>[ × ]</button>
    </div>
  );
}

function AddCategoryRow({ onAdd }: { onAdd: (category: PlanCategory) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  async function submit() {
    const trimmed = name.trim();
    setEditing(false);
    setName('');
    if (!trimmed) return;
    const { category } = await api.planCategories.create(trimmed);
    onAdd(category);
  }

  if (!editing) {
    return (
      <button className="btn icon-btn plan-cat-add" onClick={() => setEditing(true)}>
        [ + category ]
      </button>
    );
  }
  return (
    <div className="plan-cat-add-row">
      <input
        className="plan-cat-name-input"
        placeholder="category name..."
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit(); }
          if (e.key === 'Escape') { setName(''); setEditing(false); }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Categories state + load**

In `PlansWidget`, add state next to `projects`:

```ts
const [categories, setCategories] = useState<PlanCategory[]>([]);
```

Extend `load()`:

```ts
async function load() {
  const [{ plans: p }, { projects: prjs }, { categories: cats }] = await Promise.all([
    api.plans.list(),
    api.projects.list(),
    api.planCategories.list(),
  ]);
  setPlans(p);
  setProjects(prjs);
  setCategories(cats);
}
```

- [ ] **Step 4: Sections computation + category handlers**

After the `donePlans` computation, add:

```ts
const sections: Array<{ key: string; category: PlanCategory | null; plans: Plan[] }> = [
  { key: 'section-null', category: null, plans: openPlans.filter((p) => p.category_id == null) },
  ...categories.map((c) => ({
    key: `section-${c.id}`,
    category: c,
    plans: openPlans.filter((p) => p.category_id === c.id),
  })),
];

async function handleRenameCategory(id: number, name: string) {
  const { category } = await api.planCategories.update(id, { name });
  setCategories((prev) => prev.map((c) => (c.id === id ? category : c)));
}

async function handleDeleteCategory(cat: PlanCategory) {
  await api.planCategories.remove(cat.id);
  setCategories((prev) => prev.filter((c) => c.id !== cat.id));
  setPlans((prev) => prev.map((p) => (p.category_id === cat.id ? { ...p, category_id: null } : p)));
}
```

- [ ] **Step 5: Replace handleDragEnd with the cross-section version**

```ts
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;
  const activePlan = openPlans.find((p) => p.id === active.id);
  if (!activePlan) return;

  // Target: either a plan row (sortable) or a section container (droppable).
  let targetCatId: number | null;
  let overPlanId: number | null = null;
  if (typeof over.id === 'string' && over.id.startsWith('section-')) {
    const raw = over.id.slice('section-'.length);
    targetCatId = raw === 'null' ? null : Number(raw);
  } else {
    const overPlan = openPlans.find((p) => p.id === over.id);
    if (!overPlan) return;
    targetCatId = overPlan.category_id;
    overPlanId = overPlan.id;
  }

  const categoryChanged = targetCatId !== activePlan.category_id;
  if (active.id === over.id && !categoryChanged) return;

  // Rebuild the flat open list: remove, retag, insert.
  const without = openPlans.filter((p) => p.id !== activePlan.id);
  const moved = { ...activePlan, category_id: targetCatId };
  let insertIdx: number;
  if (overPlanId != null) {
    insertIdx = without.findIndex((p) => p.id === overPlanId);
    const oldIdx = openPlans.findIndex((p) => p.id === activePlan.id);
    const overIdx = openPlans.findIndex((p) => p.id === overPlanId);
    if (oldIdx < overIdx) insertIdx += 1; // dragging downward → place after the target
  } else {
    insertIdx = without.length; // dropped on a section (likely empty) → append
  }
  const inserted = [...without.slice(0, insertIdx), moved, ...without.slice(insertIdx)];

  // Normalize global order to match display order: uncategorized, then categories.
  const sectionOrder: Array<number | null> = [null, ...categories.map((c) => c.id)];
  const reordered = sectionOrder.flatMap((catId) => inserted.filter((p) => p.category_id === catId));

  setPlans([...reordered, ...donePlans]);
  if (categoryChanged) {
    api.plans.update(activePlan.id, { category_id: targetCatId }).catch(() => void load());
  }
  api.plans.reorder(reordered.map((p) => p.id)).catch(() => void load());
}
```

- [ ] **Step 6: Replace the open-plans JSX**

Replace the current `<DndContext>…</DndContext>` block in the panel body with:

```tsx
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  {sections.map((section) => (
    <SectionDroppable key={section.key} id={section.key}>
      {section.category && (
        <CategoryHeader
          category={section.category}
          count={section.plans.length}
          onRename={handleRenameCategory}
          onDelete={(c) => void handleDeleteCategory(c)}
        />
      )}
      <SortableContext items={section.plans.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {section.plans.map((plan) => (
          <SortableItem
            key={plan.id}
            plan={plan}
            projects={projects}
            onRun={handleRun}
            onMarkDone={handleMarkDone}
            onUpdate={(id, patch) => setPlans((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p))}
            onDelete={handleDelete}
          />
        ))}
      </SortableContext>
    </SectionDroppable>
  ))}
</DndContext>

<AddCategoryRow onAdd={(category) => setCategories((prev) => [...prev, category])} />
```

`AddCategoryRow` goes between the closing `</DndContext>` and the `{showDone && …}` done-plans block. `SortableItem`, `AddRow`, and the done-plans rendering stay unchanged.

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/PlansWidget.tsx
git commit -m "feat: category sections with cross-section drag and drop in plans panel"
```

---

### Task 6: Frontend — styles

**Files:**
- Modify: `frontend/src/styles.css`

⚠️ `.category-badge` already exists (entry categories) — do not touch it. All new classes use the `plan-cat-` / `plan-section` prefix.

- [ ] **Step 1: Add styles after the `.plan-add-input:focus` block (~line 832)**

```css
.plan-section {
  min-height: 8px; /* drop target for empty sections */
}

.plan-cat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 2px 0;
  border-bottom: 1px solid var(--hairline);
}

.plan-cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: text;
}

.plan-cat-name-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-bottom: 1px solid var(--hairline);
}

.plan-cat-count {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.plan-cat-add {
  margin-top: 12px;
}

.plan-cat-add-row {
  display: flex;
  margin-top: 12px;
  padding: 2px 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat: plan category section styles"
```

---

### Task 7: Manual verification (full checklist from the spec)

**Files:** none (verification only)

With `npm run dev` running, open the app, open the Plans panel:

- [ ] **Step 1:** Create two categories via `[ + category ]` → headers appear in order, count `0`
- [ ] **Step 2:** Create a plan via «new plan...» → lands in the top headerless section
- [ ] **Step 3:** Drag the plan into a category → moves; reload the page → grouping persisted
- [ ] **Step 4:** Drag into the *empty* second category (drop on the header area/section) → works
- [ ] **Step 5:** Drag back to the uncategorized section → works
- [ ] **Step 6:** Reorder two plans inside one category → order persists after reload
- [ ] **Step 7:** Click a category name → inline rename, Enter saves, Escape cancels
- [ ] **Step 8:** Delete a category that has plans → plans jump to the uncategorized section; reload confirms
- [ ] **Step 9:** Mark a categorized plan done → appears in the flat done list at the bottom; restore it → returns to its category
- [ ] **Step 10:** Empty category name (spaces) on create/rename → no request sent, no broken state
- [ ] **Step 11: Final commit if any fixes were made**

```bash
git add -A && git commit -m "fix: plan categories polish after manual verification"
```

---

## Self-review notes

- **Spec coverage:** schema/migration → Task 1; CRUD API → Task 2; plans API → Task 3; API client → Task 4; sections + header + add-row + DnD → Task 5; CSS → Task 6; manual checklist → Task 7. Category drag-reorder is explicitly out of scope (spec v1).
- **Migration ordering pitfall** (plans rebuild block) is called out in Task 1 Step 2.
- **Type consistency:** `PlanCategory` fields match `CategoryRow`; `section-null` / `section-<id>` ids consistent between `SectionDroppable` usage and `handleDragEnd` parsing.
