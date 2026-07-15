# Task Field Autocomplete — Wider Suggestion Window

## Problem

The "Task" input on the main page (`TimerPage.tsx`) offers Tab-complete ghost-text suggestions via `TaskAutocomplete`, but the suggestion source is whatever `entries` array `TimerPage` already has in state for its "past days" display — fetched with `rangeLastNDays(8)` (`TimerPage.tsx:81`). Suggestions are therefore limited to the last 8 days. The user wants suggestions to reach back about two months, without changing the visible "past days" list on the main page (which should stay at 8 days).

There is no dedicated backend endpoint for task-name suggestions today — `TaskAutocomplete` (`frontend/src/components/TaskAutocomplete.tsx`) dedupes and prefix-matches directly over the `Entry[]` array it's handed.

## Design

Decouple the suggestion data source from the display data source with a new lightweight, dedicated endpoint that returns distinct descriptions only (no full entry rows, no links) — so a 60-day lookback stays cheap regardless of entry volume.

### Backend — `backend/src/routes/entries.ts`

New route, registered after `GET /` and before `GET /:id` (Fastify's router prioritizes static paths over parametric ones regardless of order, so this is purely for readability):

```ts
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

fastify.get<{ Querystring: { days?: string } }>('/suggestions', async (req) => {
  const days = req.query.days ? parseInt(req.query.days, 10) : 60;
  const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = suggestDescriptions.all({ fromIso });
  return { descriptions: rows.map((r) => r.description) };
});
```

- `ended_at IS NOT NULL` mirrors the same predicate `listEntries` already uses for the visible list — completed entries only.
- `GROUP BY description` does the dedup server-side; `ORDER BY MAX(started_at) DESC` keeps the same "most-recently-used first" ordering the client currently produces itself.
- `LIMIT 500` is a defensive cap, not a user-facing limit — at plausible personal-use volume (a few dozen distinct descriptions a week) 60 days won't come close to it.

### Frontend — `frontend/src/lib/api.ts`

```ts
suggestions: (days = 60) =>
  request<{ descriptions: string[] }>(`/entries/suggestions?days=${days}`),
```
Added under the existing `entries` namespace, alongside `list`.

### Frontend — `frontend/src/components/TaskAutocomplete.tsx`

Prop changes from `entries: Entry[]` to `descriptions: string[]`. Since dedup now happens server-side, `buildSuggestion` drops its `Set`/dedup loop and becomes a plain prefix scan over the already-deduped, already-ordered array:

```ts
function buildSuggestion(text: string, descriptions: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const desc of descriptions) {
    if (desc.toLowerCase().startsWith(lower) && desc.length > text.length) return desc;
  }
  return '';
}
```
The `Entry` type import is no longer needed in this file.

### Frontend — `frontend/src/pages/TimerPage.tsx`

- New state: `const [suggestions, setSuggestions] = useState<string[]>([]);`
- `refresh()` fetches suggestions in the same `Promise.all` as projects/entries (same trigger — on mount and on navigation — no new refetch triggers):

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
- `<TaskAutocomplete entries={entries} .../>` → `<TaskAutocomplete descriptions={suggestions} .../>`. The `entries` state and the 8-day fetch are otherwise untouched — the visible past-days list keeps its existing 8-day window.

## Out of scope

- Making the 60-day window user-configurable in the UI (the backend accepts an optional `days` query param for flexibility/debugging, but nothing in the UI exposes it).
- Frequency-based ranking (most-used vs. most-recent) — keeps today's "most recent match wins" behavior, just over a longer window.
- Changing the visible "past days" list's 8-day window.

## Testing

No test suite in this repo (per `CLAUDE.md`) — verify manually: type a task description that was last used more than 8 days but less than 60 days ago, confirm Tab-complete now suggests it; confirm the visible past-days list on the main page is unaffected (still 8 days).
