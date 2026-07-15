# Plans Widget — Resize From All Four Corners

## Problem

The Plans widget (`frontend/src/components/PlansWidget.tsx`) currently exposes a single resize handle. It sits in the bottom-right corner of `.plans-panel` (`styles.css:586-594`, `cursor: se-resize`), not the bottom-left as originally assumed — but either way, only one corner is resizable. Users want to resize the panel by dragging from any of its four corners.

## Current behavior (for reference)

- `handleResizeMouseDown` (`PlansWidget.tsx:322-341`) captures `panelPosition.{top,left}` once at mousedown and treats them as the fixed anchor.
- On `mousemove`: `width = clientX - left`, `height = clientY - top`, each clamped to `[280/180, viewport - margin]`.
- On `mouseup`: only `panelSize` is written to `localStorage['backlog-panel-size']`.
- Panel position is stored separately (`localStorage['backlog-panel-position']`) and is only ever changed by dragging the header (`handlePanelHeaderMouseDown`, lines 343-369).

## Design

Generalize the resize handler to accept which corner is being dragged, since resizing from the top or left edges must also shift the panel's position (the opposite corner has to stay put) — dragging from the bottom-right doesn't move position, only size.

### Handler

Replace `handleResizeMouseDown()` with `handleResizeMouseDown(corner: 'nw' | 'ne' | 'sw' | 'se')`:

- Capture at mousedown: `origTop`, `origLeft`, `origWidth`, `origHeight` (from current `panelPosition`/`panelSize`), and derive the fixed anchor edges: `right = origLeft + origWidth`, `bottom = origTop + origHeight`.
- On `mousemove`, compute independently per axis based on which edge of `corner` is active:
  - **Right edge active** (`ne`, `se`): `left = origLeft` (unchanged); `width = clamp(280, innerWidth - left - 12, clientX - left)`.
  - **Left edge active** (`nw`, `sw`): `right` stays fixed; `left = clamp(0, right - 280, clientX)`; `width = right - left`.
  - **Bottom edge active** (`sw`, `se`): `top = origTop` (unchanged); `height = clamp(180, innerHeight - top - 12, clientY - top)`.
  - **Top edge active** (`nw`, `ne`): `bottom` stays fixed; `top = clamp(0, bottom - 180, clientY)`; `height = bottom - top`.
- Call `setPanelSize({width, height})` and, for corners that move the anchor (`nw`, `ne`, `sw`), also `setPanelPosition({top, left})`.
- On `mouseup`: persist both `panelSize` and `panelPosition` to their existing localStorage keys (today only size is persisted here — position persistence needs to be added to this path since `nw`/`ne`/`sw` drags can change it).

This keeps the same min-size (280×180) and viewport-clamped max-size constraints already in place; no change to `clampPanelSize`/`clampPanelPosition`.

### Markup & CSS

Add three more handle `<div>`s alongside the existing `.plans-resize-handle` (which stays exactly as-is — bottom-right, visible triangle via its `::after`). The new ones are invisible hotspots (10×10px, no `::after` triangle) — only the cursor changes on hover, per user preference:

- `.plans-resize-handle--nw` — `top: 1px; left: 1px; cursor: nwse-resize;`
- `.plans-resize-handle--ne` — `top: 1px; right: 1px; cursor: nesw-resize;`
- `.plans-resize-handle--sw` — `bottom: 1px; left: 1px; cursor: nesw-resize;`

Each `onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}` etc.

## Out of scope

- Edge (non-corner) resize handles (top/bottom/left/right mid-edges) — user asked for corners only.
- Touch/pointer-event support beyond the existing mouse-event pattern (matches current codebase convention).
- Backend persistence — size/position remain client-only `localStorage`, consistent with existing behavior.

## Testing

No test suite in this repo (per `CLAUDE.md`) — verify manually in the browser: drag each of the four corners and confirm the panel resizes from the correct anchor, respects min/max clamps, and that both size and position survive a page reload.
