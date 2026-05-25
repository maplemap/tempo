# Mobile Responsive Design

**Date:** 2026-05-25
**Scope:** `frontend/src/styles.css` only — single `@media (max-width: 600px)` block appended at the end. No new files, no component restructuring.

## Breakpoint

Single breakpoint: `max-width: 600px`. All mobile overrides live in one block.

## Changes

### App container
- Horizontal padding: `24px` → `16px`

### Navigation (`.nav`)
- Desktop: `display: flex; gap: 12px; justify-content: center`
- Mobile: `display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 0`
- Each `.btn` inside nav: `min-width: unset; width: 100%; border: none; border-top: 1px solid var(--hairline)`
- Left-column buttons get `border-right: 1px solid var(--hairline)` via `:nth-child(odd)` selector
- Result: clean grid without double borders

### Entry row (`.entry-row`)
- Desktop: 6-column grid (`110px 60px 140px 1fr auto auto`)
- Mobile: change to card layout via overrides on `.entry-row`:
  - `display: block; border: 1px solid var(--hairline); padding: 10px; margin-bottom: 6px`
  - `.time`, `.dur`, `.proj`, `.desc`, `.badges`, `.entry-actions` → `display: block` or `inline`
  - Row structure (achieved through spans):
    - Line 1: `.proj` (inline) + `.dur` floated right
    - Line 2: `.desc` (block, white-space: normal, overflow: visible)
    - Line 3: `.time` (inline) + `.entry-actions` floated right

### Entry edit form (`.entry-edit-row`)
- Desktop: `display: flex; gap: 8px; align-items: center`
- Mobile: `flex-wrap: wrap` — inputs wrap to next line naturally

### Dashboard row (`.dash-row`)
- Desktop: `grid-template-columns: 200px 80px 1fr 60px`
- Mobile: `grid-template-columns: 1fr 52px` (2 columns), hide bar and percentage columns via `display: none` on columns 3 and 4
- Alternatively: `grid-template-columns: minmax(0, 1fr) 60px 80px 40px` — keep all but shrink name column with `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

**Decision:** Keep all 4 columns, shrink name column. Less information loss.

### Counters (`.counters`)
- Desktop: `repeat(3, 1fr)`
- Mobile: `repeat(2, 1fr)` with third item `grid-column: 1 / -1`

### Timer form (`.timer-form`)
- Desktop: `grid-template-columns: 100px 1fr`
- Mobile: `grid-template-columns: 1fr` — labels and inputs stack vertically

### Running timer (`.running`)
- `.running .timer-display`: `font-size: 96px` → `64px`
- `.running .running-desc`: `font-size: 20px` → `16px`
- `.running`: `padding: 32px` → `padding: 24px 16px`

### Header (`.hd`)
- Keep `flex; justify-content: space-between` — period buttons are small enough
- If buttons overflow (EntriesPage / DashboardPage header), add `flex-wrap: wrap; gap: 8px`

## Out of scope
- No component changes
- No new CSS files
- No navigation icon redesign
- No touch-specific gesture handling
