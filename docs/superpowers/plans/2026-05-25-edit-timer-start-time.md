# Edit Running Timer Start Time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow editing `started_at` of the currently running timer directly from the running-state screen.

**Architecture:** Frontend-only change in `TimerPage.tsx`. Add an inline `datetime-local` input that appears when the user clicks the "Started HH:MM" row; on save, call the existing `PATCH /api/entries/:id` endpoint. No new backend routes needed.

**Tech Stack:** React 18, TypeScript strict, existing `api.entries.update(id, body)`

---

### Task 1: Add start-time edit UI to TimerPage

**Files:**
- Modify: `frontend/src/pages/TimerPage.tsx`

Helper functions to copy from `EntryItem.tsx` (they are not exported, so inline them):

```ts
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}
```

- [ ] **Step 1: Add state for editing start time**

In `TimerPage`, after the existing `useState` declarations, add:

```ts
const [editingStart, setEditingStart] = useState(false);
const [startDraft, setStartDraft] = useState('');
const [startError, setStartError] = useState<string | null>(null);
```

- [ ] **Step 2: Add helper functions**

After the existing helper functions (before `start()`), add:

```ts
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}

function openStartEdit() {
  if (!current) return;
  setStartDraft(toLocalInput(current.started_at));
  setStartError(null);
  setEditingStart(true);
}

async function saveStartTime() {
  if (!current) return;
  const newStartedAt = fromLocalInput(startDraft);
  if (new Date(newStartedAt).getTime() > Date.now()) {
    setStartError('! start time cannot be in the future');
    return;
  }
  try {
    await api.entries.update(current.id, { started_at: newStartedAt });
    startedAtRef.current = new Date(newStartedAt).getTime();
    setCurrent({ ...current, started_at: newStartedAt });
    setEditingStart(false);
  } catch (e) {
    setStartError(`! ${(e as Error).message}`);
  }
}
```

- [ ] **Step 3: Add `nowMax` helper**

After `saveStartTime`, add:

```ts
const nowMax = (() => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 1, 0, 0);
  return toLocalInput(d.toISOString());
})();
```

- [ ] **Step 4: Replace the running-timer JSX block**

Find the existing `if (current)` return block:

```tsx
if (current) {
  return (
    <div className="running">
      <div className="timer-display">{fmtClock(elapsedSec)}</div>
      <div className="running-desc">
        {renderDescription(current.description, { githubRepo: current.github_repo })}
      </div>
      <div className="running-proj">{current.project_name || 'no project'}</div>
      <button className="btn" onClick={stop}>[ STOP ]</button>
      <div className="hint">press space to stop</div>
    </div>
  );
}
```

Replace with:

```tsx
if (current) {
  return (
    <div className="running">
      <div className="timer-display">{fmtClock(elapsedSec)}</div>
      <div className="running-desc">
        {renderDescription(current.description, { githubRepo: current.github_repo })}
      </div>
      <div className="running-proj">{current.project_name || 'no project'}</div>

      {editingStart ? (
        <div className="start-edit">
          <input
            type="datetime-local"
            className="input"
            value={startDraft}
            max={nowMax}
            autoFocus
            onChange={(e) => { setStartDraft(e.target.value); setStartError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveStartTime();
              if (e.key === 'Escape') setEditingStart(false);
            }}
          />
          <button className="btn solid" onClick={saveStartTime}>[ SAVE ]</button>
          <button className="btn" onClick={() => setEditingStart(false)}>[ CANCEL ]</button>
          {startError && <div className="entry-error">{startError}</div>}
        </div>
      ) : (
        <div
          className="running-started"
          onClick={openStartEdit}
          title="Click to edit start time"
        >
          started {fmtTimeHM(current.started_at)}
        </div>
      )}

      <button className="btn" onClick={stop}>[ STOP ]</button>
      <div className="hint">press space to stop</div>
    </div>
  );
}
```

- [ ] **Step 5: Add CSS for the new elements**

Find `frontend/src/index.css` (or wherever `.running`, `.running-proj` etc. are defined) and add:

```css
.running-started {
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  margin-bottom: 16px;
  letter-spacing: 0.05em;
}
.running-started:hover {
  color: var(--fg);
}
.start-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.start-edit .entry-error {
  width: 100%;
  font-size: 12px;
  color: var(--red, #dc2626);
}
```

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

1. Start a timer
2. See "started HH:MM" row below project name
3. Click it — input appears pre-filled with current start time
4. Change to a past time, press Enter — elapsed time updates immediately
5. Try a future time — error appears
6. Press Escape — input closes without saving
7. Reload — start time persists (pulled from DB)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/TimerPage.tsx
git commit -m "feat(timer): allow editing start time of running timer"
```
