# Plans Widget Four-Corner Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Plans widget be resized by dragging any of its four corners, not just the bottom-right one.

**Architecture:** Generalize the single existing resize handler into one function parameterized by which corner is being dragged. Corners on the fixed (non-anchor) side of the panel behave exactly as today (`left`/`top` unchanged, `width`/`height` grow from the cursor). Corners on the moving side also update `panelPosition` so the diagonally-opposite corner stays anchored in place. Then wire up three new invisible hotspot `<div>`s (top-left, top-right, bottom-left) alongside the existing visible bottom-right handle.

**Tech Stack:** React 18 + TypeScript (strict), plain DOM mouse events (`mousemove`/`mouseup` on `document`), CSS, `localStorage` for persistence — matches the existing pattern in this file, no new dependencies.

## Global Constraints

- TypeScript strict — all edits must type-check with the project's existing `tsc` config.
- No test suite in this repo (per project `CLAUDE.md`) — every task's verification step is a manual check against the running dev server, not an automated test.
- No new dependencies — implement with the same vanilla mouse-event drag pattern already used for resize (lines 322-341) and header-drag (lines 343-369).
- Preserve existing min-size (280×180) and viewport-clamped max-size behavior exactly; do not change `clampPanelSize`/`clampPanelPosition`.
- Preserve existing localStorage keys: `STORAGE_KEY` (`'backlog-panel-size'`) and `PANEL_POSITION_KEY` (`'backlog-panel-position'`).

---

## File Map

- `frontend/src/components/PlansWidget.tsx` — resize handler logic (~line 246-341) and panel JSX (~line 546-551)
- `frontend/src/styles.css` — `.plans-resize-handle` rules (lines 586-607)

---

### Task 1: Generalize the resize handler to support all four corners

Behavior-preserving refactor: the handler becomes corner-aware, but only the existing bottom-right handle is wired up in this task, so dragging it must behave identically to today.

**Files:**
- Modify: `frontend/src/components/PlansWidget.tsx:252` (add a type alias near the other panel types)
- Modify: `frontend/src/components/PlansWidget.tsx:322-341` (`handleResizeMouseDown`)
- Modify: `frontend/src/components/PlansWidget.tsx:551` (existing handle's `onMouseDown`)

**Interfaces:**
- Produces: `type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';` and `handleResizeMouseDown(e: React.MouseEvent, corner: ResizeCorner): void` — Task 2 wires three more handles to this same function.

- [ ] **Step 1: Add the `ResizeCorner` type**

In `frontend/src/components/PlansWidget.tsx`, find:

```tsx
interface PanelSize { width: number; height: number; }
interface PanelPosition { top: number; left: number; }
```

Replace with:

```tsx
interface PanelSize { width: number; height: number; }
interface PanelPosition { top: number; left: number; }
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';
```

- [ ] **Step 2: Replace `handleResizeMouseDown` with the corner-aware version**

Find:

```tsx
  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const { top, left } = panelPosition;
    let cur = panelSize;
    const onMove = (ev: MouseEvent) => {
      const maxW = window.innerWidth - left - 12;
      const maxH = window.innerHeight - top - 12;
      const w = Math.max(280, Math.min(maxW, ev.clientX - left));
      const h = Math.max(180, Math.min(maxH, ev.clientY - top));
      cur = { width: w, height: h };
      setPanelSize(cur);
    };
    const onUp = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
```

Replace with:

```tsx
  function handleResizeMouseDown(e: React.MouseEvent, corner: ResizeCorner) {
    e.preventDefault();
    const origTop = panelPosition.top;
    const origLeft = panelPosition.left;
    const origWidth = panelSize.width;
    const origHeight = panelSize.height;
    const right = origLeft + origWidth;
    const bottom = origTop + origHeight;
    const rightEdge = corner === 'ne' || corner === 'se';
    const bottomEdge = corner === 'sw' || corner === 'se';

    let curSize = panelSize;
    let curPos = panelPosition;

    const onMove = (ev: MouseEvent) => {
      let top = origTop;
      let left = origLeft;
      let width = origWidth;
      let height = origHeight;

      if (rightEdge) {
        const maxW = window.innerWidth - left - 12;
        width = Math.max(280, Math.min(maxW, ev.clientX - left));
      } else {
        left = Math.max(0, Math.min(right - 280, ev.clientX));
        width = right - left;
      }

      if (bottomEdge) {
        const maxH = window.innerHeight - top - 12;
        height = Math.max(180, Math.min(maxH, ev.clientY - top));
      } else {
        top = Math.max(0, Math.min(bottom - 180, ev.clientY));
        height = bottom - top;
      }

      curSize = { width, height };
      curPos = { top, left };
      setPanelSize(curSize);
      setPanelPosition(curPos);
    };
    const onUp = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(curSize));
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(curPos));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
```

- [ ] **Step 3: Update the existing handle's call site**

Find:

```tsx
          <div className="plans-resize-handle" onMouseDown={handleResizeMouseDown} />
```

Replace with:

```tsx
          <div className="plans-resize-handle" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual regression check**

Run: `npm run dev` (from repo root)

In the browser:
1. Open the Plans widget.
2. Drag the bottom-right corner in several directions — confirm it resizes exactly as before (grows/shrinks from the cursor, clamps at 280×180 minimum and at the viewport edge).
3. Reload the page — confirm the size persisted.

Expected: identical behavior to before this change (this task only refactors, it doesn't add new handles yet).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PlansWidget.tsx
git commit -m "refactor: generalize Plans widget resize handler by corner"
```

---

### Task 2: Add top-left, top-right, and bottom-left resize handles

**Files:**
- Modify: `frontend/src/styles.css:607` (insert new rules after the existing `.plans-resize-handle::after` block, before `.plans-panel-header`)
- Modify: `frontend/src/components/PlansWidget.tsx:551` (add three more handle `<div>`s next to the existing one)

**Interfaces:**
- Consumes: `handleResizeMouseDown(e: React.MouseEvent, corner: ResizeCorner)` from Task 1.

- [ ] **Step 1: Add CSS for the three new handles**

In `frontend/src/styles.css`, find:

```css
.plans-resize-handle::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 10px 10px;
  border-color: transparent transparent var(--muted) transparent;
  pointer-events: none;
}
```

Immediately after that block (still before `.plans-panel-header`), add:

```css
.plans-resize-handle--nw,
.plans-resize-handle--ne,
.plans-resize-handle--sw {
  position: absolute;
  width: 10px;
  height: 10px;
  z-index: 10;
}

.plans-resize-handle--nw {
  top: 1px;
  left: 1px;
  cursor: nwse-resize;
}

.plans-resize-handle--ne {
  top: 1px;
  right: 1px;
  cursor: nesw-resize;
}

.plans-resize-handle--sw {
  bottom: 1px;
  left: 1px;
  cursor: nesw-resize;
}
```

These are deliberately separate from `.plans-resize-handle` (not additional classes on the same element) so they don't pick up its `::after` triangle — the three new corners stay invisible hotspots, per the approved design.

- [ ] **Step 2: Add the three new handle elements**

In `frontend/src/components/PlansWidget.tsx`, find:

```tsx
          <div className="plans-resize-handle" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
```

Replace with:

```tsx
          <div className="plans-resize-handle--nw" onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} />
          <div className="plans-resize-handle--ne" onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} />
          <div className="plans-resize-handle--sw" onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} />
          <div className="plans-resize-handle" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (from repo root)

In the browser:
1. Open the Plans widget.
2. Drag the **top-left** corner: confirm both position and size update, the bottom-right corner of the panel stays fixed, cursor shows `nwse-resize` on hover, and it clamps at the 280×180 minimum and at the screen edges (top/left can't go negative).
3. Drag the **top-right** corner: confirm the bottom-left corner of the panel stays fixed, cursor shows `nesw-resize` on hover, same clamping.
4. Drag the **bottom-left** corner: confirm the top-right corner of the panel stays fixed, cursor shows `nesw-resize` on hover, same clamping.
5. Drag the **bottom-right** corner again: confirm it's unchanged from Task 1 (visible triangle indicator still there, `se-resize` cursor).
6. Reload the page after resizing from a non-bottom-right corner — confirm both the size and the shifted position persisted.

Expected: all four corners resize correctly; only the bottom-right one shows the triangle indicator; the other three are invisible hotspots that just change the cursor.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlansWidget.tsx frontend/src/styles.css
git commit -m "feat: resize Plans widget from all four corners"
```
