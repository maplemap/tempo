# Entries Page: Week / Month / All with Pagination

**Date:** 2026-05-26

## Summary

Replace the current Day / Week / Month tabs on the Entries page with Week / Month / All. The "All" tab loads the last 2 months by default and supports paginated Load More via backend offset-based pagination.

---

## Backend

### `GET /api/entries` — extended query params

New optional params (backward-compatible, existing behaviour unchanged when omitted):

| Param    | Type   | Default | Notes                                      |
|----------|--------|---------|--------------------------------------------|
| `limit`  | number | 50      | Max entries per page                       |
| `offset` | number | 0       | Number of entries to skip (0-indexed)      |

Existing `from` / `to` params remain unchanged.

### Response shape change

```ts
// before
{ entries: Entry[] }

// after
{ entries: Entry[], hasMore: boolean }
```

`hasMore` is computed by running a `COUNT(*)` query over the same `WHERE` clause and checking `offset + limit < total`.

### SQL change

`listEntries` prepared statement gets `LIMIT @limit OFFSET @offset` appended. A companion `countEntries` statement (same `WHERE`, no `ORDER BY`, no `LIMIT`) is added to compute `hasMore`.

---

## Frontend

### Period type

```ts
// before
type Period = 'day' | 'week' | 'month';

// after
type Period = 'week' | 'month' | 'all';
```

### `rangeForPeriod` in `frontend/src/lib/time.ts`

- Remove `'day'` case
- Add `'all'` case: `from` = start of day 2 months ago, `to` = now

### EntriesPage state

New state fields (active only when `period === 'all'`):

| Field         | Type      | Initial | Purpose                                     |
|---------------|-----------|---------|---------------------------------------------|
| `offset`      | number    | 0       | Current pagination offset                   |
| `hasMore`     | boolean   | true    | Controls Load More button visibility        |
| `allEntries`  | Entry[]   | []      | Accumulated entries across Load More pages  |

### Behaviour

- **Switching tabs:** resets `offset` to 0, `allEntries` to `[]`, `hasMore` to `true`, fetches fresh.
- **week / month:** unchanged — call `api.entries.list(rangeForPeriod(period))`, replace `entries` state directly.
- **all (initial):** fetch with `from` = 2 months ago, `limit=50`, `offset=0`. Set `allEntries` and `hasMore`.
- **Load More:** increment `offset` by 50, fetch same range + new offset. **Append** results to `allEntries`. Update `hasMore`.
- **Load More button:** rendered only when `period === 'all' && hasMore`. Disappears as soon as `hasMore` becomes `false`.

### `api.entries.list` in `frontend/src/lib/api.ts`

Add `limit` and `offset` to the params type (both optional). Response type updated to include `hasMore: boolean`.

---

## What does NOT change

- `week` and `month` tabs: same logic as today, no pagination.
- Entry rendering (grouping by day, `EntryItem` component, edit/delete flows).
- Backend auth, validation, or other routes.
