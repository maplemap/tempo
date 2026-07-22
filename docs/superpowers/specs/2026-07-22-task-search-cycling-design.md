# Task Search — Cycle Through Multiple Matches

## Problem

`TaskAutocomplete` (`frontend/src/components/TaskAutocomplete.tsx`) matches the typed Task text against past descriptions (substring, case-insensitive) and always shows only the single most-recent match. When several past descriptions contain the same substring, there's no way to reach any match but the first — the user has to keep typing more distinguishing characters instead.

The user wants to cycle through all current matches. The originally proposed key was `→` (Right Arrow), but Right Arrow also moves the text cursor, so intercepting it either breaks normal in-text cursor movement or requires a caret-position guard. `↑` / `↓` were chosen instead: in a single-line `<input>` these keys have no default browser behavior, so they can be repurposed for cycling with zero conflict, at the cost of not being the exact key originally requested.

## Design

### State

Replace the single `suggestion` state with a list + index:

```ts
const [matches, setMatches] = useState<string[]>([]);
const [index, setIndex] = useState(0);
const suggestion = matches[index] ?? '';
```

`buildSuggestion` (returns the first match) becomes `buildMatches` (returns all matches, same filter, just not short-circuited):

```ts
function buildMatches(text: string, descriptions: string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return descriptions.filter((d) => {
    const dl = d.toLowerCase();
    return dl !== lower && dl.includes(lower);
  });
}
```

Order is preserved from `descriptions` (already most-recent-first from the backend), so `matches[0]` is still "the best/most recent match" — unchanged default behavior when there's only one match.

### Recomputation

The existing `useEffect` on `[value, descriptions]` and the `handleChange` fast-path both call `buildMatches` instead of `buildSuggestion`, and both reset `index` to `0`. This means:
- Typing a character always resets to the top (most recent) match.
- Cycling position is never preserved across edits — it only persists across `↑`/`↓` presses on a stable `value`.

### Keyboard handling

Added to `handleKeyDown`, alongside the existing `Tab` / `Escape` / `Enter` branches:

```ts
} else if (e.key === 'ArrowDown' && matches.length > 1) {
  e.preventDefault();
  setIndex((i) => (i + 1) % matches.length);
} else if (e.key === 'ArrowUp' && matches.length > 1) {
  e.preventDefault();
  setIndex((i) => (i - 1 + matches.length) % matches.length);
}
```

- No-op (not intercepted) when there are 0 or 1 matches — nothing to cycle to, and default `ArrowUp`/`ArrowDown` behavior in a text input is already a no-op, so this is purely an optimization, not a correctness requirement.
- Cycling wraps in both directions (last `↓` from the end goes to the first match; `↑` from the first goes to the last).
- `Escape` changes from `setSuggestion('')` to `setMatches([])` — clears the whole list so `↑`/`↓` do nothing until the user types again (matches today's behavior of "dismissed until next edit").
- `Tab` and `Enter` keep their existing logic, just swapping `setSuggestion('')` for `setMatches([])` when accepting — both already reference the derived `suggestion` value, so accepting the *currently selected* match (not always the first) falls out for free.

### Display

`isPrefix` / ghost-tail rendering is unchanged — it's computed from whatever `suggestion` currently is, regardless of which index produced it.

A match counter + key hint is appended only when `matches.length > 1` (no visual change at all for the common single-match case):

- Substring-match hint line (below input): `work on PR #1301 · 2/4 · ↑↓ · Tab`
- Ghost-tail placeholder line (prefix match): `press Tab to complete · 2/4 · ↑↓`

Both live inside the existing `.task-hint-key` / placeholder `<span>` — no new CSS classes, no new DOM elements.

## Out of scope

- Changing the accept keys (`Tab` to fill, `Enter` to fill + start) — unchanged.
- A visible dropdown list of all matches — rejected in favor of the existing single-line hint style, just with a counter.
- Backend changes — `matches` is derived entirely client-side from the `descriptions` array already fetched.
- Persisting cycle position across re-renders triggered by typing — resets to top match on every edit, by design.

## Testing

No test suite in this repo — verify manually: create several past entries whose descriptions share a substring (e.g. "review PR #1301", "review PR #1302", "review release notes"), then on the Timer page type a shared substring (e.g. "review") and confirm:
- The most recent one shows first, with no counter (until a second match exists in view).
- `↓` cycles forward through all matches with a `n/m` counter appearing once there are 2+, wrapping past the last back to the first.
- `↑` cycles backward, wrapping past the first back to the last.
- `Tab` fills the input with whichever match is currently selected (not always the first).
- `Enter` starts the timer with whichever match is currently selected.
- Typing another character resets the cycle back to the top match.
