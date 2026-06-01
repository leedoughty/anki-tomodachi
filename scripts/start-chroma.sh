#!/usr/bin/env bash
# Idempotently ensure a local ChromaDB server is running on localhost:8000.
# Safe to run repeatedly: if the server is already up, it does nothing.
set -euo pipefail

HEARTBEAT="http://localhost:8000/api/v2/heartbeat"
DATA_PATH="./chroma_data"
LOG_FILE="./chroma.log"

is_up() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$HEARTBEAT")" = "200" ]
}

if is_up; then
  echo "ChromaDB already running on localhost:8000"
  exit 0
fi

if ! command -v chroma >/dev/null 2>&1; then
  echo "Error: 'chroma' is not installed or not on PATH." >&2
  echo "Install it with: pipx install chromadb" >&2
  exit 1
fi

echo "Starting ChromaDB (logging to $LOG_FILE)..."
nohup chroma run --path "$DATA_PATH" >"$LOG_FILE" 2>&1 &

# Wait up to ~30s for the server to accept connections.
for _ in $(seq 1 60); do
  if is_up; then
    echo "ChromaDB is ready on localhost:8000"
    exit 0
  fi
  sleep 0.5
done

echo "Error: ChromaDB did not become ready in time. See $LOG_FILE." >&2
exit 1
