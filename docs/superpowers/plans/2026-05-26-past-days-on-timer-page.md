# Past Days on Timer Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show yesterday's and the day-before-yesterday's entries on TimerPage (collapsed by default) so the user can restart past tasks without visiting EntriesPage.

**Architecture:** Extend the entries fetch from 1 day to 3 days (one API call, no backend changes). Split entries client-side by UTC date key. Render two collapsible `PastDaySection` components below Today's entries; each shows compact rows (project + description + restart button).

**Tech Stack:** React 18, TypeScript strict, existing `api.entries.list()`, `better-sqlite3` (no changes needed)

---

### Task 1: Add `rangeLastNDays` to `time.ts`

**Files:**
- Modify: `frontend/src/lib/time.ts`

- [ ] **Step 1: Add the helper at the bottom of `time.ts`**

Open `frontend/src/lib/time.ts` and append:

```ts
export function rangeLastNDays(n: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (n - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}
```

Uses UTC to stay consistent with `isoDateKey` (which also slices the UTC portion of the ISO string).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/time.ts
git commit -m "feat: add rangeLastNDays time utility"
```

---

### Task 2: Fetch 3 days in TimerPage and split entries by date

**Files:**
- Modify: `frontend/src/pages/TimerPage.tsx`

- [ ] **Step 1: Update the import line**

At the top of `TimerPage.tsx`, `rangeForPeriod` is imported from `../lib/time`. Add `rangeLastNDays` to that import:

```ts
import { fmtClock, fmtDate, fmtDuration, fmtTimeHM, isoDateKey, rangeLastNDays } from '../lib/time';
```

Remove `rangeForPeriod` from the import (it's no longer used here).

- [ ] **Step 2: Add `expandedDays` state**

Inside the `TimerPage` function body, after the existing `useState` declarations, add:

```ts
const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

function toggleDay(key: string) {
  setExpandedDays((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
}
```

- [ ] **Step 3: Replace the `api.entries.list` call in `refresh()`**

Find this line in `refresh()`:

```ts
api.entries.list(rangeForPeriod('day'))
```

Replace with:

```ts
api.entries.list(rangeLastNDays(3))
```

- [ ] **Step 4: Add date-key helpers and split entries**

Add these derived values directly above the `return` statement of the component (before the `if (current)` block):

```ts
const todayKey      = new Date().toISOString().slice(0, 10);
const yesterdayKey  = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
const dayBeforeKey  = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 2); return d.toISOString().slice(0, 10); })();

const todayEntries     = entries.filter((e) => isoDateKey(e.started_at) === todayKey);
const yesterdayEntries = entries.filter((e) => isoDateKey(e.started_at) === yesterdayKey);
const dayBeforeEntries = entries.filter((e) => isoDateKey(e.started_at) === dayBeforeKey);
```

- [ ] **Step 5: Update the "Today" section to use `todayEntries`**

In the idle-state `return`, find the spread header that shows today's count:

```tsx
<span className="muted" style={{ fontSize: 12 }}>
  {fmtDuration(entries.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
  {' · '}{entries.length} entries
</span>
```

Replace `entries` with `todayEntries` in both spots:

```tsx
<span className="muted" style={{ fontSize: 12 }}>
  {fmtDuration(todayEntries.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
  {' · '}{todayEntries.length} entries
</span>
```

Then find the entries list render:

```tsx
{entries.length === 0 && (
  <div className="muted" style={{ padding: '12px 0' }}>no entries yet</div>
)}
{entries.map((e) => (
  <EntryItem
    key={e.id}
    entry={e}
    ...
  />
))}
```

Replace both `entries` references with `todayEntries`:

```tsx
{todayEntries.length === 0 && (
  <div className="muted" style={{ padding: '12px 0' }}>no entries yet</div>
)}
{todayEntries.map((e) => (
  <EntryItem
    key={e.id}
    entry={e}
    projects={projects}
    onChange={refresh}
    onRestart={refresh}
    editingId={editingId}
    setEditingId={setEditingId}
    timeOnly
  />
))}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/TimerPage.tsx
git commit -m "feat: fetch 3 days in TimerPage, split entries by date"
```

---

### Task 3: Add `PastDaySection` component and render past days

**Files:**
- Modify: `frontend/src/pages/TimerPage.tsx`

- [ ] **Step 1: Define `PastDaySection` above the `TimerPage` export**

Add this component directly above `export default function TimerPage()`:

```tsx
interface PastDaySectionProps {
  entries: Entry[];
  collapsed: boolean;
  onToggle: () => void;
  onRestart: () => void;
}

function PastDaySection({ entries, collapsed, onToggle, onRestart }: PastDaySectionProps) {
  if (entries.length === 0) return null;

  const totalSec = entries.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);

  async function restart(entry: Entry) {
    await api.timer.start({ projectId: entry.project_id, description: entry.description ?? '' });
    onRestart();
  }

  return (
    <>
      <hr className="rule" />
      <div
        className="spread"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <span>
          <span className="muted" style={{ marginRight: 6 }}>{collapsed ? '▶' : '▼'}</span>
          <span className="section-title" style={{ margin: 0 }}>{fmtDayHeader(entries[0].started_at)}</span>
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {fmtDuration(totalSec)}{' · '}{entries.length} entries
        </span>
      </div>
      {!collapsed && (
        <div className="entries">
          {entries.map((e) => (
            <div key={e.id} className="entry-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="proj">{e.project_name ?? '—'}</span>
              <span className="desc" style={{ flex: 1 }}>{e.description ?? ''}</span>
              <span className="entry-actions">
                <button
                  className="btn icon-btn"
                  onClick={() => restart(e)}
                  title="Restart this task"
                >[ ▶ ]</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

Import `fmtDayHeader` — add it to the `time` import line if not already there:

```ts
import { fmtClock, fmtDate, fmtDuration, fmtDayHeader, fmtTimeHM, isoDateKey, rangeLastNDays } from '../lib/time';
```

- [ ] **Step 2: Render `PastDaySection` inside the scrollable div, after today's entries**

In the idle-state `return`, the scrollable div wraps today's entries:

```tsx
<div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
  <div className="entries">
    {todayEntries.length === 0 && ...}
    {todayEntries.map(...)}
  </div>
</div>
```

Add the two past-day sections inside that same scrollable div, after the `<div className="entries">` block:

```tsx
<div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
  <div className="entries">
    {todayEntries.length === 0 && (
      <div className="muted" style={{ padding: '12px 0' }}>no entries yet</div>
    )}
    {todayEntries.map((e) => (
      <EntryItem
        key={e.id}
        entry={e}
        projects={projects}
        onChange={refresh}
        onRestart={refresh}
        editingId={editingId}
        setEditingId={setEditingId}
        timeOnly
      />
    ))}
  </div>
  <PastDaySection
    entries={yesterdayEntries}
    collapsed={!expandedDays.has(yesterdayKey)}
    onToggle={() => toggleDay(yesterdayKey)}
    onRestart={refresh}
  />
  <PastDaySection
    entries={dayBeforeEntries}
    collapsed={!expandedDays.has(dayBeforeKey)}
    onToggle={() => toggleDay(dayBeforeKey)}
    onRestart={refresh}
  />
</div>
```

This keeps all content in the same scroll container.
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173` (or the backend port shown in `.env`).

Check:
1. If you have entries from yesterday/day-before — two collapsed sections appear below Today with `▶ MON DD MON` header and duration/count
2. Clicking a header expands it — compact rows with `proj  description  [ ▶ ]`
3. Clicking `[ ▶ ]` starts the timer with the correct project and description
4. If no entries for a past day — that section is absent entirely
5. Today's entry count and duration are correct (not inflated by past entries)
6. Restarting a past entry navigates back to the running state (timer shows, not the idle form)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TimerPage.tsx
git commit -m "feat: show past 2 days as collapsible sections on timer page"
```
