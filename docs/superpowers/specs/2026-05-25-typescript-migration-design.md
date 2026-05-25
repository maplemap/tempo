# TypeScript Migration Design

**Date:** 2026-05-25  
**Project:** Tempo (personal time tracker)  
**Scope:** Full migration — backend (Node.js/Fastify/ESM) + frontend (React/Vite) + shared types

---

## Summary

Migrate all source files from plain JS/JSX to TypeScript with `strict: true` enabled from day one. Both backend and frontend are migrated in a single pass. Shared domain types live in `shared/types/` and are imported by both sides — no separate npm package, just relative imports within the monorepo.

---

## Architecture

### Directory Structure

```
tempo/
  shared/
    types/
      index.ts        # re-export all
      entry.ts        # Entry, TimerState
      project.ts      # Project
      sync.ts         # SyncState, ExternalEvent, EventType
    tsconfig.json     # noEmit, for IDE type-checking only
  backend/
    src/
      server.ts
      lib/
        env.ts
        auth.ts
        autolink.ts
        time.ts
        sync/
          github.ts
      db/
        index.ts
      routes/
        auth.ts
        timer.ts
        entries.ts
        projects.ts
        stats.ts
        sync.ts
        github.ts
    tsconfig.json
  frontend/
    src/
      App.tsx
      main.tsx
      components/
        AsciiBar.tsx
        ConfirmInline.tsx
        EntryItem.tsx
        EntryRow.tsx
        Nav.tsx
      lib/
        api.ts
        renderDescription.tsx
        time.ts
      pages/
        DashboardPage.tsx
        EntriesPage.tsx
        LoginPage.tsx
        SettingsPage.tsx
        TimerPage.tsx
    tsconfig.json
    vite.config.js    # stays .js — no migration needed
```

`shared/types/` is imported via relative paths: `../../shared/types` from backend or frontend. No workspace packages needed.

---

## TypeScript Configuration

### `backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`"module": "ESNext"` + `"moduleResolution": "bundler"` lets `tsx` and Vite resolve imports without requiring `.js` extension suffixes — matching current ESM import style.

### `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Vite auto-discovers `tsconfig.json` — no changes to `vite.config.js` needed.

### `shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["types"]
}
```

---

## Runtime — Backend

**Dev:** `tsx watch src/server.ts` (replaces `node --watch src/server.js`)  
**Prod:** `tsc` compiles `.ts` → `dist/`, then `node dist/server.js`

`tsx` handles ESM natively — no `.js` extension workarounds required.

---

## Dependencies

### Backend `devDependencies` (new)

```json
{
  "typescript": "^5.6",
  "tsx": "^4.19",
  "@types/node": "^22",
  "@types/better-sqlite3": "^7",
  "@types/jsonwebtoken": "^9",
  "@types/node-cron": "^3"
}
```

### Backend `scripts` (updated)

```json
{
  "dev": "tsx watch src/server.ts",
  "start": "node dist/server.js",
  "build": "tsc",
  "typecheck": "tsc --noEmit"
}
```

### Frontend `devDependencies` (new)

```json
{
  "typescript": "^5.6",
  "@types/react": "^18",
  "@types/react-dom": "^18"
}
```

Frontend scripts are unchanged — Vite already supports TSX.

### Root `package.json` `scripts` (new script)

```json
{
  "typecheck": "npm run typecheck --workspace=backend && tsc --noEmit -p frontend/tsconfig.json"
}
```

---

## Shared Types

### `shared/types/entry.ts`

```ts
export interface Entry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  what: string;
  started_at: number;   // unix timestamp (seconds)
  stopped_at: number;
  duration: number;     // seconds
}

export interface TimerState {
  running: boolean;
  entry: Omit<Entry, 'stopped_at' | 'duration'> | null;
}
```

### `shared/types/project.ts`

```ts
export interface Project {
  id: number;
  name: string;
  archived: 0 | 1;
  github_repo: string | null;
  github_base_branch: string;
}
```

### `shared/types/sync.ts`

```ts
export interface SyncState {
  running: boolean;
  last_sync: number | null;
  error: string | null;
}

export type EventType = 'pr_created' | 'pr_reviewed' | 'pr_merged';

export interface ExternalEvent {
  id: number;
  source: 'github';
  event_type: EventType;
  title: string;
  url: string | null;
  happened_at: number;
  project_id: number | null;
}
```

### `shared/types/index.ts`

```ts
export * from './entry';
export * from './project';
export * from './sync';
```

---

## Migration Order

Execute in a single branch/PR:

1. Install dependencies (backend + frontend)
2. Create `tsconfig.json` files (backend, frontend, shared)
3. Create `shared/types/` with all interfaces
4. Migrate **backend** file by file — rename `.js` → `.ts`, fix compiler errors:
   - `lib/env.ts` first (no imports, defines env shape)
   - `lib/time.ts`, `lib/autolink.ts`
   - `lib/auth.ts`
   - `db/index.ts` (typed DB rows using shared types)
   - `lib/sync/github.ts`
   - `routes/*.ts` (typed request/reply using Fastify generics)
   - `server.ts` last
5. Migrate **frontend** file by file — rename `.jsx` → `.tsx`, `.js` → `.ts`:
   - `lib/time.ts`, `lib/api.ts`
   - `lib/renderDescription.tsx`
   - `components/*.tsx`
   - `pages/*.tsx`
   - `App.tsx`, `main.tsx`
6. Update `CLAUDE.md` — replace "No TypeScript" note, update stack section and file extension references

---

## Docker / Dockerfile

Add build step before `CMD`:

```dockerfile
RUN npm run build    # runs tsc in backend/
CMD ["node", "dist/server.js"]
```

The `dist/` directory is produced at image build time; `backend/src/` is not needed at runtime.

---

## What Does NOT Change

- `vite.config.js` — stays `.js`, Vite works fine with a JS config
- `schema.sql` — not a source file
- `backend/data/` — runtime data, not source
- All environment variable names and values
- All API routes and response shapes
- Database schema and migration pattern

---

## Success Criteria

- `npm run typecheck` passes with zero errors in both backend and frontend
- `npm run dev` starts correctly (tsx watch + Vite)
- App works identically to pre-migration (login, timer, entries, GitHub sync)
- No `any` types except where unavoidable (must be commented with reason)
