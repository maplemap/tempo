# Entry Categories — Design

Date: 2026-05-28
Status: Approved (pending implementation plan)

## Summary

Add a category dimension to time entries so the user can see how their time breaks down by type of work (Review, Bug, Refactor, Task, Daily). Categories are auto-detected from the entry description and the parent task name via keyword matching — no AI / LLM involvement. The Dashboard gains a hierarchical "By category" section with drill-down: Category → Task → Entries. Default category is `task`.

## Goals & non-goals

**Goals**
- Five fixed categories: `review`, `bug`, `refactor`, `task` (default), `daily`.
- Auto-detection on entry create and on description change (only while the user has not manually overridden).
- Manual override per-entry, with a way to reset back to auto.
- Dashboard view: hierarchical drill-down (category → tasks → entries) with totals and percentages, replacing nothing — added alongside existing "By project" / "By day".
- Backfill all existing entries on first migration run.

**Non-goals**
- No AI / LLM call per entry. Keyword matching is sufficient for five well-known buckets.
- No UI for editing the keyword list (hardcoded in `backend/src/lib/categorize.ts`).
- No filter on EntriesPage by category — Dashboard owns the analytics.
- No persisted expand/collapse state on Dashboard between sessions.
- No localization of category labels (English `review`/`bug`/... shown as-is in UI).
- No category-vs-GitHub-event reconciliation (separate concern).

## Decisions log

| Decision | Choice | Reason |
|---|---|---|
| AI vs heuristic | Heuristic (regex) | 5 fixed buckets with predictable wording; AI adds latency, cost, opacity for no measurable win. |
| Category granularity | Per entry, not per task | An entry's category should describe what was done in that time slice, not the task's overall theme. |
| Auto-detect trigger | Create + on description change, only when `category_manual=0` | Respects manual overrides; auto re-categorizes while the user hasn't intervened. |
| Categorization input | `task.name + entry.description` concatenated | Highest hit rate; entry-level keywords still beat task-level when they differ. |
| Keyword storage | Hardcoded in `backend/src/lib/categorize.ts` | YAGNI on a settings UI for five buckets. |
| Conflict priority | Daily > Review > Bug > Refactor > Task | Daily is most distinctive (meetings); Review describes the action being performed; Bug beats Refactor (a bug is a bug even if found during refactoring); Task is the catch-all fallback. |
| Implementation locus | Backend only | Single source of truth; no duplicated keyword logic on frontend. |
| Backfill | Yes, on migration | Dashboard is meaningful from day one; one-off cost. |
| UI badge | Plain text `[category]`, no color, monospace, fixed width | Matches the ASCII aesthetic of the app. |

## Data model

Two new columns on `time_entries`, added via inline `ALTER TABLE` in `backend/src/db/index.ts`:

```sql
ALTER TABLE time_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'task';
ALTER TABLE time_entries ADD COLUMN category_manual INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_entries_category_started ON time_entries(category, started_at);
```

- `category`: lowercase string, one of `'review' | 'bug' | 'refactor' | 'task' | 'daily'`. Stored lowercase; UI renders as-is.
- `category_manual`: `0` while auto-detect controls the value, `1` when the user has set it explicitly. The auto-detect path skips entries with `category_manual=1`.

Shared type (new file `shared/types/category.ts`):

```ts
export type Category = 'review' | 'bug' | 'refactor' | 'task' | 'daily';
export const CATEGORIES: Category[] = ['review', 'bug', 'refactor', 'task', 'daily'];
```

## Categorization logic

New file `backend/src/lib/categorize.ts`:

```ts
import type { Category } from '../../../shared/types/category.js';

// Order matters — first match wins.
// Priority: Daily > Review > Bug > Refactor > Task (default).
const RULES: Array<{ category: Category; patterns: RegExp[] }> = [
  {
    category: 'daily',
    patterns: [
      /\b(daily|standup|stand-up|sync|митинг|мітинг|дейлі|дейли|синк)\b/i,
    ],
  },
  {
    category: 'review',
    patterns: [
      /\b(review|reviewing|reviewed|огляд|ревʼю|ревью|code\s*review|cr)\b/i,
      /\bPR\s+#?\d+/i,
    ],
  },
  {
    category: 'bug',
    patterns: [
      /\b(bug|fix|fixing|fixed|hotfix|issue|defect|помилка|баг|фікс|фіксити|регрес)\b/i,
    ],
  },
  {
    category: 'refactor',
    patterns: [
      /\b(refactor|refactoring|cleanup|clean-up|tidy|simplify|rename|extract|рефактор|рефакторинг|почистити)\b/i,
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

Notes:
- `\b` word boundaries prevent "preview" → review and "buggy" → bug spurious matches.
- `categorize()` never throws; worst case returns `'task'`.
- `categorizeEntry` is the public entry point for routes and backfill.

## API changes

### `backend/src/routes/entries.ts`

- **On POST (create entry)**: compute `category = categorizeEntry(taskName, description)`; persist with `category_manual=0`.
- **On PUT/PATCH (update description)**: if `category_manual=0`, recompute and write the new category. If `category_manual=1`, leave the category alone.
- **Response shape**: every entry response gains a `category: Category` field (in addition to existing `description`, `task_id`, `links`, `badges`, etc.).

### New endpoint: `PATCH /api/entries/:id/category`

```
body: { category: Category | null }
```

- `category` set to one of the five values → write `category` and `category_manual=1`.
- `category` set to `null` → reset to auto: set `category_manual=0`, recompute via `categorizeEntry` using current task name and description, persist the result.
- Invalid value → 400 with `{ error: 'invalid category' }`.

### `backend/src/routes/stats.ts` — new endpoint

`GET /api/stats/by-category?from=<iso>&to=<iso>` returns:

```ts
{
  range: { from: string; to: string };
  total: number;                          // total duration_seconds in range
  categories: Array<{
    category: Category;
    total: number;                        // seconds
    tasks: Array<{
      task_id: number | null;             // null = entries with no task link
      task_name: string | null;
      total: number;                      // seconds
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

- One SQL query joins entries to tasks, returns rows; grouping into the nested shape happens in Node.
- Categories with `total === 0` are omitted.
- Sort order: categories by `total DESC`; tasks within a category by `total DESC`; entries within a task by `started_at DESC`.
- Auth: `requireAuth` like all other `/api/*` routes.

## Migration & backfill

In `backend/src/db/index.ts`, after the existing `try { ALTER TABLE … } catch {}` block:

```ts
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'task'`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category_manual INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_category_started ON time_entries(category, started_at)`); } catch {}

const categorized = db.prepare(
  `SELECT COUNT(*) AS n FROM time_entries WHERE category != 'task'`
).get() as { n: number };

if (categorized.n === 0) {
  const rows = db.prepare(`
    SELECT e.id, e.description, t.name AS task_name
    FROM time_entries e
    LEFT JOIN tasks t ON t.id = e.task_id
  `).all() as Array<{ id: number; description: string | null; task_name: string | null }>;

  const update = db.prepare(`UPDATE time_entries SET category = ? WHERE id = ?`);
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) {
      update.run(categorizeEntry(r.task_name, r.description), r.id);
    }
  });
  tx(rows);
  console.log(`[db] backfilled categories for ${rows.length} entries`);
}
```

The backfill check (`categorized.n === 0`) prevents re-running on later startups. If a user ever manually resets every entry back to `task`, the backfill would re-trigger — accepted edge case (alternative is a dedicated migrations table, overkill for this project).

## UI

### EntriesPage — badge per entry

A new component `frontend/src/components/CategoryBadge.tsx`:

- Renders `[category]` in lowercase, monospace, fixed width `10ch` so descriptions align.
- No color — matches the project's ASCII aesthetic.
- Click → small dropdown listing all five categories plus a final `[auto]` option.
  - Choosing one of the five → `PATCH /api/entries/:id/category` with that value.
  - Choosing `[auto]` → `PATCH /api/entries/:id/category` with `null`.
- On success, the page refetches the entry (or the row state is updated in place) so the badge reflects the new value.

Visual layout (already-existing entry rows on EntriesPage):

```
14:00–15:30  [refactor]  refactor auth module                   1h 30m
16:00–16:45  [bug]       fix login redirect after refactor      0h 45m
17:00–17:30  [review]    review PR #234                         0h 30m
```

### DashboardPage — new "By category" section

Inserted between "By project" and "By day" in `frontend/src/pages/DashboardPage.tsx`. Reuses the existing period selector (Day/Week/Month) — the same `rangeForPeriod(period)` powers the new endpoint.

Categories are collapsed by default (`▸`); clicking expands to show tasks (`▾`). Tasks are collapsed by default; clicking expands to show entries.

```
By category
▾ [bug]       11h 24m  ████████████░░░░  35%
   ▾ Fix login redirect                       8h 15m
        Mon 14:00–15:30  refactor auth module        1h 30m
        Mon 16:00–17:00  fix login redirect bug      1h 00m
        Tue 10:00–13:45  more login fixes            3h 45m
   ▸ Fix timer race condition                 3h 09m
▸ [review]     6h 30m  ███████░░░░░░░░░  20%
▸ [refactor]   5h 45m  ██████░░░░░░░░░░  18%
▸ [task]       8h 20m  █████████░░░░░░░  26%
▸ [daily]      1h 00m  █░░░░░░░░░░░░░░░   3%
```

- Reuses the existing `<AsciiBar>` component for the bar.
- Percentage is rounded `Math.round((cat.total / stats.total) * 100)`.
- Expand/collapse state lives in component-local `useState<Set<string>>` for categories and tasks. Not persisted between reloads.

### `frontend/src/lib/api.ts` additions

- `api.entries.setCategory(id, category | null)` → `PATCH /api/entries/:id/category`.
- `api.stats.byCategory(range)` → `GET /api/stats/by-category?from=…&to=…`.

## Error handling

- `categorize()` and `categorizeEntry()` never throw; the worst case returns `'task'`. No logging needed.
- `PATCH /api/entries/:id/category` rejects unknown categories with 400; otherwise the standard auth/404 patterns apply.
- The dashboard endpoint returns `categories: []` (and `total: 0`) when no entries are in range — UI shows "no data" placeholder, matching existing convention.

## Verification (manual)

No automated test suite. The smoke test below runs the happy paths and the priority edge case:

1. Create entry with description `fix bug in login` → badge `[bug]`.
2. Create entry with description `review PR #234` → badge `[review]`.
3. Create entry with empty description → badge `[task]`.
4. Create entry with description `review bug fix` → badge `[review]` (priority test).
5. Manually set an entry to `refactor` → reload page → still `refactor`.
6. Click `[auto]` on that entry → category reverts to the auto-detected value.
7. Open Dashboard with Week selected → "By category" section shows non-empty buckets, percentages roughly add up to 100%, drill-down expands category → task → entries.

## Open questions

None at design time. Implementation plan to follow via `writing-plans`.
