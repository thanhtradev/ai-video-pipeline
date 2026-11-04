#!/usr/bin/env bash
# launchd entry point of the deployer (D-100): one poll of /deploy every 30 s. Separate from the
# worker's job, because a process that restarts its own service is killed mid-update. It reads only
# the database password; the update scripts it runs get no secret in their environment.
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
CONFIG_FILE="${AIVIDEO_CONFIG:-$AIVIDEO_ROOT/config/worker.env}"
REPO_DIR="${AIVIDEO_REPO:-$AIVIDEO_ROOT/repo}"
export AIVIDEO_ROOT

# shellcheck source=/dev/null
set -a && source "$CONFIG_FILE" && set +a
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${WORKER_ID:?}"

DB_PASSWORD="$(security find-generic-password -a aivideo -s aivideo-db-password -w)"
export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${DB_NAME}"
unset DB_PASSWORD

cd "$REPO_DIR/worker"
exec npx tsx src/deployer/main.ts
