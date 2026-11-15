#!/usr/bin/env bash
# Runs every end-to-end check against a freshly built ./cookbook on throwaway data:
#   1. API checks for recipes and photos (Python 3 + Pillow)
#   2. a browser walkthrough in real Chrome, mouse and touch (Node + puppeteer-core)
# Each part gets its own empty database, so the checks can rely on fixed ids.
#
#   make build && e2e/run.sh            # from the repo root
#   CHROME=/path/to/chrome e2e/run.sh   # if Chrome is not /usr/bin/google-chrome
#   E2E_WORK=/some/dir e2e/run.sh       # where data, server logs and screenshots go (CI keeps it)
#
# Screenshots of the walkthrough are left in the printed directory.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
bin="$root/cookbook"
port="${E2E_PORT:-18080}"
base="http://127.0.0.1:$port"

[[ -x "$bin" ]] || { echo "build first: make build" >&2; exit 1; }
[[ -d "$here/node_modules" ]] || (cd "$here" && npm install --no-audit --no-fund >/dev/null)

work="${E2E_WORK:-$(mktemp -d -t cookbook-e2e.XXXXXX)}"
mkdir -p "$work"
pid=""
stop() {
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  pid=""
}
trap stop EXIT

# start <name> [extra env…]: a server on an empty data directory
start() {
  local name="$1"; shift
  # the checks rely on fixed ids, so a reused E2E_WORK must not keep an old database
  rm -rf "$work/$name"
  mkdir -p "$work/$name"
  env GIN_MODE=release SERVER_LISTEN="127.0.0.1:$port" \
    DATABASE_PATH="$work/$name/db.sqlite3" PHOTOS_PATH="$work/$name/photos" \
    LOCAL_USER_EMAIL=cook@example.com LOCAL_USER_NAME="Тест Кухар" \
    "$@" "$bin" -c /nonexistent >"$work/$name/server.log" 2>&1 &
  pid=$!
  for _ in $(seq 50); do
    curl -sf "$base/api/auth/providers" >/dev/null && return
    sleep 0.1
  done
  echo "server did not start, see $work/$name/server.log" >&2
  exit 1
}

python3 "$here/api/make_images.py" "$work/img"
failed=0

echo "== API: recipes"
start recipes
python3 "$here/api/test_recipes.py" "$base" || failed=1
stop

echo "== API: photos"
# a 1 MB limit lets the fixtures exercise 413 without huge files
start photos PHOTOS_MAX_UPLOAD_MB=1
python3 "$here/api/test_photos.py" "$base" "$work/img" || failed=1
stop

echo "== browser"
start browser LOCAL_AUTO_SUBMIT=true
python3 "$here/api/seed.py" "$base" "$work/img"
mkdir -p "$work/shots"
node "$here/browser/run.mjs" "$base" "$work/shots" "$work/img" || failed=1
stop

echo "screenshots: $work/shots"
exit "$failed"
