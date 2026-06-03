# Vite Middleware Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate port 5173 by embedding Vite directly into the Fastify dev server via middleware mode, so all traffic goes through a single port.

**Architecture:** Replace `@fastify/http-proxy` (which proxied to a standalone Vite process on :5173) with `@fastify/middie` + `vite.createServer({ middlewareMode: true })`. Vite middleware is mounted into Fastify; HMR WebSocket is attached to Fastify's own HTTP server. Production path (static files) is unchanged.

**Tech Stack:** Fastify 4, `@fastify/middie@^8.3.3`, `vite@^5.4.6` (dynamic import, dev only), Node ESM

---

### Task 1: Update backend dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install `@fastify/middie` as a regular dependency**

```bash
cd backend && npm install @fastify/middie@^8.3.3
```

Expected: `package.json` gets `"@fastify/middie": "^8.3.3"` in `dependencies`.

- [ ] **Step 2: Install `vite` as a dev dependency in backend**

```bash
cd backend && npm install --save-dev vite@^5.4.6
```

Expected: `"vite": "^5.4.6"` in `devDependencies` of `backend/package.json`. This is needed because `await import('vite')` runs from backend's Node process, which resolves modules from `backend/node_modules/`. In production Docker the branch is never reached (publicDir exists) and `npm ci --omit=dev` skips devDeps, so Vite won't be in the prod image.

- [ ] **Step 3: Remove `@fastify/http-proxy`**

```bash
cd backend && npm uninstall @fastify/http-proxy
```

Expected: `@fastify/http-proxy` is gone from `dependencies` and `node_modules`.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "deps: replace @fastify/http-proxy with @fastify/middie + vite in backend"
```

---

### Task 2: Rewrite the dev branch in `backend/src/server.ts`

**Files:**
- Modify: `backend/src/server.ts`

Current dev branch (lines ~53–61):
```ts
import fastifyHttpProxy from '@fastify/http-proxy';
// ...
const viteUpstream = process.env['VITE_UPSTREAM'] ?? 'http://localhost:5173';
// ...
} else {
  await app.register(fastifyHttpProxy, {
    upstream: viteUpstream,
    prefix: '/',
    rewritePrefix: '/',
    websocket: true,
    http2: false
  });
  app.log.info(`[dev] proxying non-/api requests to ${viteUpstream}`);
}
```

- [ ] **Step 1: Replace the `fastifyHttpProxy` import with `middie`**

At the top of `backend/src/server.ts`, remove:
```ts
import fastifyHttpProxy from '@fastify/http-proxy';
```
Add:
```ts
import middie from '@fastify/middie';
```

- [ ] **Step 2: Remove the `viteUpstream` variable**

Remove this line (it was only used by the proxy):
```ts
const viteUpstream = process.env['VITE_UPSTREAM'] ?? 'http://localhost:5173';
```

- [ ] **Step 3: Replace the `else` block with Vite middleware**

Replace:
```ts
} else {
  await app.register(fastifyHttpProxy, {
    upstream: viteUpstream,
    prefix: '/',
    rewritePrefix: '/',
    websocket: true,
    http2: false
  });
  app.log.info(`[dev] proxying non-/api requests to ${viteUpstream}`);
}
```

With:
```ts
} else {
  await app.register(middie);
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: new URL('../../frontend', import.meta.url).pathname,
    server: { middlewareMode: true, hmr: { server: app.server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.log.info('[dev] Vite middleware mounted — port 5173 not used');
}
```

Note: `root` points to the frontend directory so Vite finds `vite.config.js` and `index.html`. `import.meta.url` is the current file (`backend/src/server.ts`), two `..` steps up reach the repo root, then `frontend/`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat: embed Vite as middleware in Fastify dev server"
```

---

### Task 3: Simplify `frontend/vite.config.js`

**Files:**
- Modify: `frontend/vite.config.js`

The `server` block configured host/port/HMR for the standalone Vite process. In middleware mode Vite doesn't start its own server, so the entire block is irrelevant. `loadEnv` was only needed to read `PORT` for `hmr.clientPort` — that's gone too.

- [ ] **Step 1: Replace the config**

Rewrite `frontend/vite.config.js` to:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/vite.config.js
git commit -m "chore: remove standalone server config from vite.config.js"
```

---

### Task 4: Simplify root `package.json` dev scripts

**Files:**
- Modify: `package.json` (root)

`concurrently` ran backend and frontend in parallel. Now there is no separate frontend process.

- [ ] **Step 1: Update the `dev` script and remove `dev:frontend`**

In root `package.json`, change:
```json
"dev": "concurrently -n backend,frontend -c blue,green \"npm:dev:backend\" \"npm:dev:frontend\"",
"dev:backend": "cd backend && npm run dev",
"dev:frontend": "cd frontend && npm run dev",
```

To:
```json
"dev": "npm run dev:backend",
"dev:backend": "cd backend && npm run dev",
```

Remove the `dev:frontend` line entirely.

- [ ] **Step 2: Remove `concurrently` from devDependencies**

```bash
npm uninstall concurrently
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove concurrently, backend now serves frontend in dev"
```

---

### Task 5: Manual verification

No automated test suite in this project. Verify by running the app.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected output includes `[dev] Vite middleware mounted — port 5173 not used`.
No output about port 5173 being bound.

- [ ] **Step 2: Verify the app loads on the backend port**

Open `http://localhost:3001` (or whatever PORT is in `.env`).
Expected: Tempo login page loads, React app works, no errors in console.

- [ ] **Step 3: Verify port 5173 is not listening**

```bash
lsof -i :5173
```

Expected: no output (nothing listening on 5173).

- [ ] **Step 4: Verify HMR works**

Edit any frontend file (e.g., add a comment to `frontend/src/App.tsx`).
Expected: browser auto-reloads or hot-patches without full page reload. No HMR errors in console.

- [ ] **Step 5: Verify API still works**

Log in and create a time entry. Expected: works as before.
