# Task Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ghost-text inline autocomplete to the Task input on TimerPage, sourcing suggestions from the last 8 days of entries already loaded on the page.

**Architecture:** A new controlled component `TaskAutocomplete` wraps the Task `<input>`, deriving a suggestion from `entries` prop on each keystroke. The suggestion tail is rendered as a ghost overlay div positioned over the input; Tab accepts, Escape dismisses, Enter accepts then starts timer. No new API calls.

**Tech Stack:** React 18, TypeScript strict, CSS custom properties (existing `--muted` var)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `frontend/src/components/TaskAutocomplete.tsx` | Autocomplete logic + ghost text DOM |
| Modify | `frontend/src/styles.css` | `.task-ghost`, `.task-ghost-tail` classes |
| Modify | `frontend/src/pages/TimerPage.tsx` | Replace Task `<input>` with `<TaskAutocomplete>` |

---

### Task 1: Add CSS classes to styles.css

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Open `frontend/src/styles.css` and append the following two rules after the `.input:focus` block (around line 104):**

```css
.task-ghost {
  position: absolute;
  top: 0;
  left: 0;
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

These classes must match `.input` exactly in `padding` and `font` so the ghost text aligns with the input text.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style: add task-ghost classes for autocomplete overlay"
```

---

### Task 2: Create TaskAutocomplete component

**Files:**
- Create: `frontend/src/components/TaskAutocomplete.tsx`

- [ ] **Step 1: Create the file with the following content:**

```tsx
import { useEffect, useState } from 'react';
import type { Entry } from '../lib/api';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  entries: Entry[];
}

export default function TaskAutocomplete({ value, onChange, onEnter, entries }: Props) {
  const [suggestion, setSuggestion] = useState('');

  // Clear suggestion when value is cleared externally (e.g. after timer stop)
  useEffect(() => {
    if (!value) setSuggestion('');
  }, [value]);

  function buildSuggestion(text: string): string {
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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setSuggestion(buildSuggestion(v));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      onChange(suggestion);
      setSuggestion('');
    } else if (e.key === 'Escape') {
      setSuggestion('');
    } else if (e.key === 'Enter') {
      const final = suggestion || value;
      if (suggestion) {
        onChange(suggestion);
        setSuggestion('');
      }
      onEnter(final);
    }
  }

  const tail = suggestion ? suggestion.slice(value.length) : '';

  return (
    <div style={{ position: 'relative' }}>
      {tail && (
        <div className="task-ghost" aria-hidden="true">
          <span style={{ visibility: 'hidden' }}>{value}</span>
          <span className="task-ghost-tail">{tail}</span>
        </div>
      )}
      <input
        className="input"
        placeholder="e.g. review PR #1301"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {tail && (
        <span className="muted" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
          press Tab to complete
        </span>
      )}
    </div>
  );
}
```

**Key design notes:**
- `buildSuggestion` iterates `entries` newest-first (API order) and deduplicates descriptions via `Set` — so the freshest match wins.
- `desc.length > text.length` prevents suggesting when the user has already typed the full description.
- `onEnter(final)` receives the resolved text so TimerPage's `start()` can use it directly, bypassing the React state update delay.

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd /path/to/repo && npx tsc --noEmit -p frontend/tsconfig.json
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TaskAutocomplete.tsx
git commit -m "feat: add TaskAutocomplete component with ghost-text inline suggestion"
```

---

### Task 3: Integrate TaskAutocomplete in TimerPage

**Files:**
- Modify: `frontend/src/pages/TimerPage.tsx`

- [ ] **Step 1: Add import at the top of `frontend/src/pages/TimerPage.tsx` (after existing imports):**

```tsx
import TaskAutocomplete from '../components/TaskAutocomplete';
```

- [ ] **Step 2: Modify `start()` to accept optional override text (so Enter-via-autocomplete works without stale state). Find the existing `start()` function and replace it:**

```tsx
async function start(overrideText?: string) {
  const trimmed = (overrideText ?? taskText).trim();
  if (!trimmed) return;
  const pid = projectId ? Number(projectId) : null;

  const res = await api.timer.start({ projectId: pid, description: trimmed });
  setCurrent(res.current);
  startedAtRef.current = new Date(res.current.started_at).getTime();
}
```

`overrideText` is used when autocomplete provides the final text (bypasses stale `taskText` state). The spacebar shortcut still calls `start()` with no args, which falls back to `taskText` as before.

- [ ] **Step 3: In the stopped-state JSX (the `return` at the bottom), find the Task input block:**

```tsx
<span className="label">Task</span>
<input
  className="input"
  placeholder="e.g. review PR #1301"
  value={taskText}
  onChange={(e) => { setTaskText(e.target.value); }}
  onKeyDown={(e) => { if (e.key === 'Enter') void start(); }}
/>
```

Replace it with:

```tsx
<span className="label">Task</span>
<TaskAutocomplete
  value={taskText}
  onChange={setTaskText}
  onEnter={(finalText) => void start(finalText)}
  entries={entries}
/>
```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit -p frontend/tsconfig.json
```

Expected: no output.

- [ ] **Step 5: Start dev server and verify behavior manually**

```bash
npm run dev
```

Open `http://localhost:3001` (or whichever PORT is set in `.env`). Log in, go to Timer page.

Check the following scenarios:

| Scenario | Expected |
|---|---|
| Type first few chars of a past entry description | Ghost tail appears in muted color; "press Tab to complete" hint shows |
| Press Tab | Input fills with full description; ghost disappears |
| Press Escape while suggestion visible | Ghost disappears; typed text stays |
| Press Enter while suggestion visible | Timer starts with the full suggested text |
| Press Enter without suggestion | Timer starts with whatever was typed |
| Press Spacebar (global shortcut, input not focused) | Timer starts normally (unchanged behavior) |
| Type something with no matching past entry | No ghost, no hint |
| Timer stops → taskText clears | No ghost shown on next open |

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TimerPage.tsx
git commit -m "feat: integrate TaskAutocomplete into TimerPage Task input"
```
