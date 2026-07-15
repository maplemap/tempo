# Task Field Autocomplete — Wider Suggestion Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Task field's Tab-complete suggestions reach back ~60 days instead of 8, without changing the visible "past days" list on the main page.

**Architecture:** Add a dedicated, lightweight backend endpoint that returns distinct task descriptions (no full entry rows, no links) over a configurable day window. The frontend fetches this separately from the existing 8-day entries fetch and feeds it to `TaskAutocomplete`, which now works over a plain `string[]` instead of `Entry[]`.

**Tech Stack:** Fastify route + better-sqlite3 prepared statement (backend), React state + `fetch`-based `api.ts` client (frontend). No new dependencies.

## Global Constraints

- TypeScript strict — all edits must type-check with the project's existing `tsc` config (backend: `npm run typecheck` in `backend/`; frontend: `npx tsc --noEmit` in `frontend/`).
- No test suite in this repo (per project `CLAUDE.md`) — every task's verification step is a manual check against the running dev server, not an automated test.
- No new dependencies.
- All `/api/*` routes require auth (`requireAuth` hook) except `/api/auth/login` — the new endpoint follows this.
- Preserve existing behavior of the visible "past days" list (still `rangeLastNDays(8)`) and of the existing `GET /api/entries` endpoint — this plan only adds a new route, it doesn't modify existing ones.

---

## File Map

- `backend/src/routes/entries.ts` — add `GET /suggestions` route + prepared statement (~after line 48, and ~after line 82)
- `frontend/src/lib/api.ts` — add `entries.suggestions()` client method (~line 106)
- `frontend/src/components/TaskAutocomplete.tsx` — change prop from `entries: Entry[]` to `descriptions: string[]`
- `frontend/src/pages/TimerPage.tsx` — fetch suggestions, wire into `TaskAutocomplete`

---

### Task 1: Add `GET /api/entries/suggestions` backend endpoint

**Files:**
- Modify: `backend/src/routes/entries.ts:45-56` (add prepared statement after `countEntries`)
- Modify: `backend/src/routes/entries.ts:73-88` (add route after the `GET /` handler)

**Interfaces:**
- Produces: `GET /api/entries/suggestions?days=<n>` → `{ descriptions: string[] }`, most-recently-used first. `days` optional, defaults to 60.

- [ ] **Step 1: Add the prepared statement**

Find:

```ts
const countEntries = db.prepare<RangeParams, { count: number }>(`
  SELECT COUNT(*) AS count FROM time_entries e
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso AND e.ended_at IS NOT NULL
`);

const getEntry = db.prepare<[number | string], DbEntry>(`
```

Replace with:

```ts
const countEntries = db.prepare<RangeParams, { count: number }>(`
  SELECT COUNT(*) AS count FROM time_entries e
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso AND e.ended_at IS NOT NULL
`);

interface SuggestParams { fromIso: string; }

const suggestDescriptions = db.prepare<SuggestParams, { description: string }>(`
  SELECT description
  FROM time_entries
  WHERE started_at >= @fromIso AND ended_at IS NOT NULL
    AND description IS NOT NULL AND description != ''
  GROUP BY description
  ORDER BY MAX(started_at) DESC
  LIMIT 500
`);

const getEntry = db.prepare<[number | string], DbEntry>(`
```

- [ ] **Step 2: Add the route**

Find:

```ts
  fastify.get<{ Querystring: { from?: string; to?: string; limit?: string; offset?: string } }>('/', async (req) => {
    const { from, to, limit: limitStr, offset: offsetStr } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const limit = limitStr ? parseInt(limitStr, 10) : 100000;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    const rows = listEntries.all({ fromIso, toIso, limit, offset });
    const total = countEntries.get({ fromIso, toIso })!.count;
    const hasMore = offset + limit < total;
    return { entries: rows.map(hydrate), hasMore };
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
```

Replace with:

```ts
  fastify.get<{ Querystring: { from?: string; to?: string; limit?: string; offset?: string } }>('/', async (req) => {
    const { from, to, limit: limitStr, offset: offsetStr } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const limit = limitStr ? parseInt(limitStr, 10) : 100000;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    const rows = listEntries.all({ fromIso, toIso, limit, offset });
    const total = countEntries.get({ fromIso, toIso })!.count;
    const hasMore = offset + limit < total;
    return { entries: rows.map(hydrate), hasMore };
  });

  fastify.get<{ Querystring: { days?: string } }>('/suggestions', async (req) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : 60;
    const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = suggestDescriptions.all({ fromIso });
    return { descriptions: rows.map((r) => r.description) };
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (from repo root) and wait for it to serve on the port from `.env` (`PORT`, e.g. `3005`).

```bash
curl -c /tmp/tempo-cookies.txt -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}"   # use the value from your local .env

curl -b /tmp/tempo-cookies.txt "http://localhost:3005/api/entries/suggestions?days=60"
```

Expected: `{"descriptions":[...]}` — an array of distinct, non-empty description strings from completed entries in the last 60 days, ordered most-recently-used first (compare against a couple of task descriptions you know you used recently vs. one you haven't touched in over 8 days but used within the window).

Also sanity-check the default and the existing endpoint are untouched:
```bash
curl -b /tmp/tempo-cookies.txt "http://localhost:3005/api/entries/suggestions"       # same result as ?days=60
curl -b /tmp/tempo-cookies.txt "http://localhost:3005/api/entries?from=2020-01-01T00:00:00.000Z"  # still works as before
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/entries.ts
git commit -m "feat: add GET /api/entries/suggestions endpoint"
```

---

### Task 2: Wire the wider suggestion window into the Task field

**Files:**
- Modify: `frontend/src/lib/api.ts:102-117` (add `suggestions` method to the `entries` namespace)
- Modify: `frontend/src/components/TaskAutocomplete.tsx` (prop change, simplified `buildSuggestion`)
- Modify: `frontend/src/pages/TimerPage.tsx:78-85` (fetch suggestions, wire prop) and the `TaskAutocomplete` call site (~line 191-198)

**Interfaces:**
- Consumes: `GET /api/entries/suggestions` from Task 1, returning `{ descriptions: string[] }`.
- Produces: `api.entries.suggestions(days?: number): Promise<{ descriptions: string[] }>`; `TaskAutocomplete` now takes `descriptions: string[]` instead of `entries: Entry[]`.

- [ ] **Step 1: Add the API client method**

Find:

```ts
  entries: {
    list:    (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ entries: Entry[]; hasMore: boolean }>(`/entries${qs ? `?${qs}` : ''}`);
    },
```

Replace with:

```ts
  entries: {
    list:    (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ entries: Entry[]; hasMore: boolean }>(`/entries${qs ? `?${qs}` : ''}`);
    },
    suggestions: (days = 60) =>
      request<{ descriptions: string[] }>(`/entries/suggestions?days=${days}`),
```

- [ ] **Step 2: Simplify `TaskAutocomplete` to work over plain strings**

Find:

```tsx
import { useEffect, useState } from 'react';
import type { Entry } from '../lib/api';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  entries: Entry[];
}

function buildSuggestion(text: string, entries: Entry[]): string {
  if (!text) return '';
  const seen = new Set<string>();
  for (const e of entries) {
    const desc = e.description;
    if (!desc || seen.has(desc)) continue;
    seen.add(desc);
    if (desc.toLowerCase().startsWith(text.toLowerCase()) && desc.length > text.length) {
      return desc;
    }
  }
  return '';
}

export default function TaskAutocomplete({ value, onChange, onEnter, entries }: Props) {
  const [suggestion, setSuggestion] = useState('');

  // Recompute suggestion whenever value or entries change
  useEffect(() => {
    setSuggestion(buildSuggestion(value, entries));
  }, [value, entries]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setSuggestion(buildSuggestion(v, entries));
  }
```

Replace with:

```tsx
import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  descriptions: string[];
}

function buildSuggestion(text: string, descriptions: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const desc of descriptions) {
    if (desc.toLowerCase().startsWith(lower) && desc.length > text.length) {
      return desc;
    }
  }
  return '';
}

export default function TaskAutocomplete({ value, onChange, onEnter, descriptions }: Props) {
  const [suggestion, setSuggestion] = useState('');

  // Recompute suggestion whenever value or descriptions change
  useEffect(() => {
    setSuggestion(buildSuggestion(value, descriptions));
  }, [value, descriptions]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setSuggestion(buildSuggestion(v, descriptions));
  }
```

(The rest of the file — `handleKeyDown`, the render — is unchanged; it doesn't reference `entries`.)

- [ ] **Step 3: Fetch suggestions and wire them into `TimerPage`**

Find:

```ts
  const [entries, setEntries] = useState<Entry[]>([]);
```

Replace with:

```ts
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
```

Find:

```ts
  async function refresh() {
    const [{ projects: prjs }, { entries: ents }] = await Promise.all([
      api.projects.list(),
      api.entries.list(rangeLastNDays(8)),
    ]);
    setProjects(prjs);
    setEntries(ents);
  }
```

Replace with:

```ts
  async function refresh() {
    const [{ projects: prjs }, { entries: ents }, { descriptions }] = await Promise.all([
      api.projects.list(),
      api.entries.list(rangeLastNDays(8)),
      api.entries.suggestions(),
    ]);
    setProjects(prjs);
    setEntries(ents);
    setSuggestions(descriptions);
  }
```

Find the `TaskAutocomplete` call site:

```tsx
            <TaskAutocomplete
              value={taskText}
              onChange={setTaskText}
              onEnter={(finalText) => void start(finalText)}
              entries={entries}
            />
```

Replace with:

```tsx
            <TaskAutocomplete
              value={taskText}
              onChange={setTaskText}
              onEnter={(finalText) => void start(finalText)}
              descriptions={suggestions}
            />
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (confirms `TaskAutocomplete`'s new prop name lines up with the call site, and no other file still references the old `entries` prop on `TaskAutocomplete`).

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (from repo root) if not already running.

In the browser:
1. Log in, go to the main (Timer) page.
2. Start and stop a timer with a distinctive task description (e.g. `zzz-plan-test-task`), so it exists as a completed entry.
3. Manually backdate it past 8 days: open the entry in the Entries page and change its date to ~30 days ago (or use the API: `PATCH /api/entries/:id` with an adjusted `started_at`/`ended_at`), so it now falls outside the main page's visible 8-day window but inside the 60-day suggestion window.
4. Go back to the main page, type the first few characters of `zzz-plan-test-task` into the Task field.
5. Confirm the ghost-text Tab-complete suggestion appears (proving the suggestion source now reaches back further than 8 days).
6. Confirm the visible "past days" list on the main page still only shows the last 8 days (the backdated entry should NOT appear there) — this proves the display window is unaffected.
7. Check the browser console for errors (should be none related to this change).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/TaskAutocomplete.tsx frontend/src/pages/TimerPage.tsx
git commit -m "feat: widen Task field autocomplete suggestion window to 60 days"
```
