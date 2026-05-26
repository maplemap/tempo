# Past Days on Timer Page

**Date:** 2026-05-26  
**Status:** Approved

## Problem

To restart a task from yesterday or the day before, the user had to navigate to the Entries page. The Timer page only showed today's entries.

## Goal

Show yesterday's and the day-before-yesterday's entries on the Timer page so the user can restart them without leaving the main screen.

## Design

### Layout

The Timer page (idle state) gains two collapsible day sections below "Today":

```
TODAY                                     1h 30m · 2 entries
09:00—10:30  my-app  fix login bug        [▶][×]
11:00—12:00  api     review PR #42        [▶][×]

──────────────────────────────────────────────────
▶ MON 26 MAY                              3h 20m · 5 entries
──────────────────────────────────────────────────
▶ SUN 25 MAY                              2h 10m · 3 entries
```

After clicking a past day header, it expands inline:

```
▼ MON 26 MAY                              3h 20m · 5 entries
   my-app  refactor auth                  [▶]
   api     write tests                    [▶]
   my-app  fix pagination                 [▶]
```

### Behavior

- Past day sections are **collapsed by default**
- Clicking the header toggles expand/collapse
- If a past day has no entries, its section is not rendered
- Today's entries remain unchanged (full EntryItem with edit, delete, restart)
- Past day entries show **compact rows only**: project name + description + `[▶]` restart button
- Clicking `[▶]` starts the timer with that entry's project and description, same as today

### Data

- Single API call: date range extended from today-only to **last 3 days** (from: start of day-before-yesterday, to: now)
- Entries split client-side by `isoDateKey(entry.started_at)` into three buckets: today, yesterday, dayBefore
- Collapsed state tracked with `useState<Set<string>>` keyed by ISO date string (e.g. `"2026-05-25"`)

## Components

### `TimerPage.tsx` changes

1. Replace `rangeForPeriod('day')` with a 3-day range helper
2. Split `entries` into `todayEntries`, `yesterdayEntries`, `dayBeforeEntries`
3. Add `collapsedDays: Set<string>` state, toggle on header click
4. Render two new `PastDaySection` components below Today

### New `PastDaySection` component (defined in `TimerPage.tsx`)

Props:
```ts
interface PastDaySectionProps {
  dateKey: string;       // "2026-05-25"
  entries: Entry[];
  projects: Project[];
  collapsed: boolean;
  onToggle: () => void;
  onRestart: () => void;
}
```

Renders:
- Header row: toggle arrow + formatted date + total duration + entry count
- When expanded: compact `EntryRow` per entry (project name, description, `[▶]`)

### Compact entry row (inline JSX in PastDaySection)

No new component needed — simple `<div>` with project name, description, and a restart button that calls `api.timer.start(...)` directly.

## Time utilities

Add a helper to `time.ts`:

```ts
export function rangeLastNDays(n: number): { from: string; to: string }
```

Returns from = start of (today - (n-1) days), to = now. Used in TimerPage to fetch 3 days.

## Edge cases

- If yesterday or the day before has 0 entries → section not rendered
- If all 3 days are empty → no sections rendered (same as today's "no entries yet")
- Timer running state is unchanged — past-day sections only appear when timer is stopped
