#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/creativeos-next-dev.pid"
PORT="${PORT:-3210}"
HOST="${HOST:-127.0.0.1}"

mkdir -p "$RUN_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping previous CreativeOS dev server (pid $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true

    for _ in {1..30}; do
      if ! kill -0 "$OLD_PID" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done

    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "Previous server did not stop gracefully; forcing shutdown..."
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
fi

if lsof -n -P -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use by another process."
  echo "Use a different port, for example: PORT=3211 npm run dev:clean"
  exit 1
fi

cd "$ROOT_DIR"
echo "Starting CreativeOS on http://$HOST:$PORT"
node_modules/.bin/next dev --hostname "$HOST" --port "$PORT" &
DEV_PID="$!"
echo "$DEV_PID" > "$PID_FILE"

cleanup() {
  if kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

trap cleanup EXIT INT TERM
wait "$DEV_PID"
