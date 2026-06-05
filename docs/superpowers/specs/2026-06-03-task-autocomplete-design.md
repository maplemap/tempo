---
name: task-autocomplete
description: Inline ghost-text autocomplete for the Task input on TimerPage
metadata:
  type: project
---

# Task Autocomplete — Design Spec

## Overview

When the user types in the Task input on TimerPage, an inline ghost-text suggestion appears showing the first matching entry description from the last 8 days. The user can press Tab to accept or keep typing to dismiss.

## Architecture

A new controlled component `TaskAutocomplete` wraps the existing Task `<input>` and owns the suggestion state. `TimerPage` passes `entries`, `value`, and `onChange` down to it — no new API calls needed.

```
TimerPage
  └── TaskAutocomplete
        ├── <div> wrapper (position: relative)
        │     ├── <div class="task-ghost">  ← ghost overlay (pointer-events: none)
        │     │     ├── <span visibility:hidden>{value}</span>  ← spacer
        │     │     └── <span class="task-ghost-tail">{tail}</span>  ← dim suffix
        │     └── <input class="input" />
        └── <span class="hint"> press Tab  ← shown when suggestion active
```

## Component: `TaskAutocomplete`

**Location:** `frontend/src/components/TaskAutocomplete.tsx`

**Props:**
```ts
interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  entries: Entry[];
}
```

**Internal state:** `suggestion: string` (full description of the matched entry, or `''`)

**Suggestion derivation:**
- Build a deduplicated list of descriptions from `entries`, preserving order newest-first (entries are already sorted newest-first from the API)
- On each `value` change: find the first description where `desc.toLowerCase().startsWith(value.toLowerCase())`
- If `value` is empty or no match → `suggestion = ''`

**Keyboard handling:**
- `Tab` — if suggestion exists: call `onChange(suggestion)`, clear suggestion, `preventDefault()`
- `Escape` — clear suggestion
- `Enter` — accept suggestion (if any) by calling `onChange(suggestion)`, then call `onEnter()`; this ensures the timer starts with the full suggested text even without Tab

**onChange flow:**
- User types → `onChange(e.target.value)` → parent updates `value` → new render derives suggestion

## DOM & Styles

The ghost overlay div is absolutely positioned to exactly overlay the input, with matching font and padding (`padding: 6px 0`, `font: inherit`, `14px`). The typed prefix is rendered with `visibility: hidden` (takes space, invisible) so the tail appears at the correct x-offset.

**New CSS classes in `styles.css`:**

```css
.task-ghost {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  padding: 6px 0;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  pointer-events: none;
  white-space: pre;
  overflow: hidden;
}

.task-ghost-tail {
  color: var(--muted);
}
```

The wrapper `<div>` gets `position: relative`. The input itself needs no changes.

A hint `press Tab` appears as a small `.muted` span below the input (same row, right-aligned) when a suggestion is active — consistent with the existing `.hint` style pattern in the codebase.

## Integration in TimerPage

Replace the inline `<input>` for Task with `<TaskAutocomplete>`:

```tsx
<TaskAutocomplete
  value={taskText}
  onChange={setTaskText}
  onEnter={() => void start()}
  entries={entries}
/>
```

The `start()` function already reads `taskText` from state, so no other changes needed in `TimerPage`.

## Edge Cases

- **Empty value** → no suggestion shown
- **value === suggestion** (full match already typed) → no ghost rendered (tail would be empty)
- **Timer running** → `TaskAutocomplete` is not rendered (TimerPage shows the running view instead)
- **No entries** → no suggestions, input behaves like plain input

## What is NOT in scope

- Fuzzy/substring matching
- History beyond the 8 days already loaded
- Keyboard navigation through multiple suggestions (only the top match is shown)
- Persisting or ranking suggestion history
