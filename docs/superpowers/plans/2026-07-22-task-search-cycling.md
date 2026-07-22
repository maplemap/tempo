# Task Search Cycling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user cycle through every past task description matching what they've typed in the Timer page's Task field, using `↑` / `↓`, instead of only ever seeing the single most-recent match.

**Architecture:** `frontend/src/components/TaskAutocomplete.tsx` already computes a single "best" substring match against the `descriptions` prop and shows it as either an inline ghost-text tail (prefix match) or a hint line below the input (mid-string match), acceptable via `Tab`/`Enter`. This plan replaces the single-match state with a `matches: string[]` + `index: number` pair, wires `↑`/`↓` to move `index`, and adds a `n/m` counter to the existing hint line only when there's more than one match. No other file changes.

**Tech Stack:** React 18 + TypeScript strict (frontend), Vite dev server. No test framework in this repo — verification is manual, in the running app.

## Global Constraints

- TypeScript strict — the file is `.tsx`; no new `any`, no loosened types.
- No new props, no new API calls, no new CSS classes — this is a self-contained internal change to `TaskAutocomplete.tsx` (per spec: `docs/superpowers/specs/2026-07-22-task-search-cycling-design.md`).
- No visual change at all when there are 0 or 1 matches — the counter/key hint only appears once `matches.length > 1`.
- `↑`/`↓` cycling wraps in both directions; not intercepted (no `preventDefault`) when there are 0 or 1 matches.
- Every edit to `value` (typing) resets the cycle position back to the top (most recent) match — cycle position is never preserved across edits, only across `↑`/`↓` presses on a stable `value`.

---

### Task 1: Replace single-match state with cycling match list in `TaskAutocomplete`

**Files:**
- Modify: `frontend/src/components/TaskAutocomplete.tsx` (full rewrite of the file's logic — same file, same exported component name/props)

**Interfaces:**
- Consumes: nothing new — same props as today (`value: string`, `onChange: (v: string) => void`, `onEnter: (finalValue: string) => void`, `descriptions: string[]`), still imported and rendered unchanged from `frontend/src/pages/TimerPage.tsx:293-298`.
- Produces: nothing new is exposed — this is a leaf UI component with no other consumers in the codebase (confirmed only `TimerPage.tsx` imports it).

- [x] **Step 1: Replace the full contents of `frontend/src/components/TaskAutocomplete.tsx`**

```tsx
import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  descriptions: string[];
}

// Reverse-i-search style: match the typed text anywhere in a description
// (substring). Returns all matches, most-recent-first (same order as
// `descriptions`). Skips a match that is identical to what's typed (nothing
// to complete).
function buildMatches(text: string, descriptions: string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return descriptions.filter((desc) => {
    const dl = desc.toLowerCase();
    return dl !== lower && dl.includes(lower);
  });
}

// Split a suggestion around the matched substring so the match can be
// emphasized (bck-i-search shows the whole line with the search term inside it).
function emphasize(suggestion: string, text: string) {
  const idx = suggestion.toLowerCase().indexOf(text.toLowerCase());
  if (idx < 0) return <>{suggestion}</>;
  return (
    <>
      {suggestion.slice(0, idx)}
      <span className="task-hint-match">{suggestion.slice(idx, idx + text.length)}</span>
      {suggestion.slice(idx + text.length)}
    </>
  );
}

export default function TaskAutocomplete({ value, onChange, onEnter, descriptions }: Props) {
  const [matches, setMatches] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const suggestion = matches[index] ?? '';

  // Recompute matches whenever value or descriptions change; always reset
  // back to the top (most recent) match.
  useEffect(() => {
    setMatches(buildMatches(value, descriptions));
    setIndex(0);
  }, [value, descriptions]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setMatches(buildMatches(v, descriptions));
    setIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      onChange(suggestion);
      setMatches([]);
    } else if (e.key === 'ArrowDown' && matches.length > 1) {
      e.preventDefault();
      setIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp' && matches.length > 1) {
      e.preventDefault();
      setIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Escape') {
      setMatches([]);
    } else if (e.key === 'Enter') {
      // Capture final before onChange: parent state update is async, onEnter reads this value directly
      const final = suggestion || value;
      if (suggestion) {
        onChange(suggestion);
        setMatches([]);
      }
      onEnter(final);
    }
  }

  // Inline ghost tail only works when the suggestion starts with the typed text
  // (the completion is appended after the cursor). For a substring match the
  // matched part sits mid-string, so we fall back to a full-line hint below.
  const isPrefix = !!suggestion && suggestion.toLowerCase().startsWith(value.toLowerCase());
  const tail = isPrefix ? suggestion.slice(value.length) : '';
  const counterHint = matches.length > 1 ? ` · ${index + 1}/${matches.length} · ↑↓` : '';

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
      {suggestion && !isPrefix ? (
        <span className="muted task-hint">
          {emphasize(suggestion, value)}
          <span className="task-hint-key">{counterHint} · Tab</span>
        </span>
      ) : (
        <span
          className="muted"
          style={{ fontSize: 11, display: 'block', marginTop: 2, visibility: tail ? 'visible' : 'hidden' }}
        >
          press Tab to complete{counterHint}
        </span>
      )}
    </div>
  );
}
```

- [x] **Step 2: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`

Expected: no output, exit code 0. (There is no dedicated `typecheck` npm script in this repo — `tsc --noEmit` against the existing `frontend/tsconfig.json` is the direct check.)

- [x] **Step 3: Start the app and manually verify in a browser**

  Actually verified via an isolated local dev instance (port 3999, scratch copy of `backend/data/tempo.db`, throwaway `ADMIN_PASSWORD`) rather than `make run`, because the project's normal ports (3000/5173) belong to an unrelated running app and port 3005 was already serving this repo's own **production** Docker container (`tempo`, up and untouched throughout) — reusing either would have risked disrupting a live service. Driven with Playwright (`chromium`) against real pre-existing task descriptions (e.g. "Add drag-drop to plans" family, 6 substring matches; "review PR #1301", a unique single match). Confirmed: counter appears only at 2+ matches and is absent (byte-identical to prior hint text) at exactly 1 match; `↓`/`↑` cycle with correct wrap-around in both directions across all 6 matches; `Tab` fills the input with whichever match is currently selected, not always the first; `Escape` clears the hint; typing further narrows/resets matches correctly, including the exact-match-exclusion rule. No console errors attributable to this component. The real production container and its database were never written to (isolated scratch DB copy used for the local test instance; verified via `docker ps` uptime and DB row/hash checks before and after). Screenshots taken and reviewed, confirming correct rendering (ghost-tail tail text + `press Tab to complete · n/m · ↑↓` hint line, and the full-line `{match} · n/m · ↑↓ · Tab` hint for non-prefix matches).

Run: `make run` (or `npm run dev` from repo root if Docker isn't available) and open the Timer page.

This repo has no automated test suite (per `CLAUDE.md`) — verification is manual, in the running app:

1. Create at least three past entries whose descriptions share a substring, e.g. by starting and immediately stopping timers with descriptions `review PR #1301`, `review PR #1302`, `review release notes` (most-recent-last, so `review release notes` is the most recent).
2. In the Task field, type `review`.
   - Expect: the hint shows `review release notes` (the most recent match) with a `1/3` counter, since all three descriptions match.
   - Then clear the field and type `1301` instead: expect the hint shows `review PR #1301` with **no** counter, since only one description matches that text.
3. With `review` typed and the counter showing `1/3`, press `↓`: expect the hint updates to the second match and the counter shows `2/3`. Press `↓` again: third match, `3/3`. Press `↓` once more: wraps back to the first match, `1/3`.
4. Press `↑`: expect it steps backward (from `1/3` it should wrap to `3/3`).
5. With any non-first match selected, press `Tab`: expect the input fills with exactly that selected description (not always the first/most-recent one).
6. Retype `review`, cycle to a non-first match with `↓`, then press `Enter`: expect the timer starts with that selected description (check the running-task label at the top of the page).
7. Type an additional character (narrowing to a single match, e.g. `review release`): expect the cycle resets to the top match and the counter disappears (since now there's only one match).
8. Confirm `Escape` still dismisses the hint entirely (no ghost tail, no hint line) until you edit the text again.

- [ ] **Step 4: Commit** — skipped intentionally: the user asked to keep this work uncommitted on `main` so they can review and commit it themselves.

```bash
git add frontend/src/components/TaskAutocomplete.tsx
git commit -m "feat: cycle through task search matches with up/down arrows"
```
