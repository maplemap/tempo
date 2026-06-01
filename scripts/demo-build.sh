#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[demo-build]${NC} $1"; }
fail() { echo -e "${RED}[demo-build] ERROR:${NC} $1"; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "Docker not found"
docker info >/dev/null 2>&1       || fail "Docker daemon not running"

if lsof -i :3000 -t >/dev/null 2>&1; then
  fail "Port 3000 is in use. Stop any running services first (make stop)."
fi

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
  log "Stopping demo container..."
  docker compose -f docker-compose.demo.yml down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# ── 1. Seed demo database ─────────────────────────────────────────────────────
log "Seeding demo database..."
NODE_PATH="$REPO_ROOT/backend/node_modules" node "$REPO_ROOT/scripts/demo-seed.mjs"

# ── 2. Start demo container ───────────────────────────────────────────────────
log "Building and starting demo container..."
docker compose -f docker-compose.demo.yml up --build -d

# ── 3. Wait for health ────────────────────────────────────────────────────────
log "Waiting for app to be ready (max 30s)..."
MAX_WAIT=30; elapsed=0
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do
  [ $elapsed -ge $MAX_WAIT ] && fail "App did not start within ${MAX_WAIT}s"
  sleep 1; elapsed=$((elapsed + 1))
done
log "App ready in ${elapsed}s"

# ── 4. Take screenshots ───────────────────────────────────────────────────────
log "Taking screenshots..."
mkdir -p "$REPO_ROOT/docs/screenshots"
node "$REPO_ROOT/scripts/demo-screenshots.mjs"

# ── 5. Generate HTML ──────────────────────────────────────────────────────────
log "Generating landing page..."
node "$REPO_ROOT/scripts/demo-html.mjs"

# ── 6. Deploy to gh-pages ─────────────────────────────────────────────────────
log "Deploying to gh-pages..."
DEPLOY_TMP=$(mktemp -d)
cp -r "$REPO_ROOT/docs/." "$DEPLOY_TMP/"
REMOTE_URL=$(git remote get-url origin)

cd "$DEPLOY_TMP"
git init -b gh-pages
git -c user.name="demo-build" -c user.email="demo@build" add -A
git -c user.name="demo-build" -c user.email="demo@build" commit -m "chore: demo update"
git remote add origin "$REMOTE_URL"
git push origin gh-pages --force
cd "$REPO_ROOT"
rm -rf "$DEPLOY_TMP"

log "Done!"
log "GitHub Pages URL: https://maplemap.github.io/tempo/"
log "First time? Enable Pages in: Settings → Pages → Source: gh-pages branch, / (root)"
