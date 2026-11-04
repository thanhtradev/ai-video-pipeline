#!/usr/bin/env bash
# systemd entry point of the deployer (D-100); same as ops/launchd/run-deployer.sh, but the database
# password comes from a file (ops/systemd/run-worker.sh). It reads no other secret.
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
CONFIG_FILE="${AIVIDEO_CONFIG:-$AIVIDEO_ROOT/config/worker.env}"
REPO_DIR="${AIVIDEO_REPO:-$AIVIDEO_ROOT/repo}"
export AIVIDEO_ROOT

# shellcheck source=/dev/null
set -a && source "$CONFIG_FILE" && set +a
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${WORKER_ID:?}"

DB_PASSWORD="$(tr -d '\n' < "$AIVIDEO_ROOT/config/secrets/aivideo-db-password")"
export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${DB_NAME}"
unset DB_PASSWORD

cd "$REPO_DIR/worker"
exec npx tsx src/deployer/main.ts
