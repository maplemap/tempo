# Vite Middleware Mode — Design Spec

**Date:** 2026-06-03
**Status:** Approved

## Problem

In dev mode (`npm run dev`), Vite runs as a standalone HTTP server on `127.0.0.1:5173`. Even though the Fastify backend already proxies all frontend requests through its own port, port 5173 remains directly accessible from a local browser, bypassing the intended single entry point.

## Goal

Eliminate port 5173 entirely. All dev traffic (HTML, JS, HMR WebSocket) goes through the Fastify port only.

## Approach: Vite Middleware Mode

Vite 5 supports `server.middlewareMode: true` — in this mode Vite does not create its own HTTP server. Instead it exposes a Connect-compatible middleware stack (`vite.middlewares`) that can be mounted into any Node.js server.

Fastify supports Connect middleware via `@fastify/middie`.

HMR WebSocket is attached to Fastify's underlying `app.server` via `server.hmr: { server: app.server }`.

## Architecture

```
Before:
  browser → :3001 (Fastify) → proxy → :5173 (Vite standalone)
                                         ↑ also directly accessible

After:
  browser → :3001 (Fastify, embeds Vite middleware)
                  port 5173 does not exist
```

## Changes

### `backend/package.json`
- Add `vite` to `devDependencies` (same version as frontend: `^5.4.6`)
- Add `@fastify/middie` to `dependencies`

### `backend/src/server.ts`
- In the dev branch (when `publicDir` does not exist), replace `@fastify/http-proxy` with:
  1. Register `@fastify/middie` plugin
  2. Dynamically import `vite` (dev-only, avoids bundling in prod)
  3. Call `vite.createServer({ server: { middlewareMode: true, hmr: { server: app.server } }, appType: 'spa' })`
  4. Mount `vite.middlewares` via `app.use(vite.middlewares)`

### `frontend/vite.config.js`
- Remove the `server` block entirely (no host, port, strictPort, hmr config needed — Vite no longer manages its own server)

### Root `package.json`
- Change `dev` script from `concurrently ... dev:backend ... dev:frontend` to just `npm run dev:backend`
- Remove `dev:frontend` script (or keep it commented for standalone use if ever needed — but prefer deletion)

## What stays the same

- Production build: unchanged (static files served by `@fastify/static`)
- Docker dev (`make run`): runs `npm run dev` inside the container — same script, now simpler
- All API routes, auth, DB: untouched

## Non-goals

- No changes to the production Dockerfile
- No changes to any route handlers
