#!/usr/bin/env bash
# Records the Drive ids of videos archived before the library (D-104, ops/video-library.md §4), on a
# Mac worker. A dry run by default: it lists what it would save. --save writes the ids to the
# database. Either way it only reads Drive. Secrets come from the Keychain as in run-worker.sh and
# live only in this process's environment.
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
CONFIG_FILE="${AIVIDEO_CONFIG:-$AIVIDEO_ROOT/config/worker.env}"
REPO_DIR="${AIVIDEO_REPO:-$AIVIDEO_ROOT/repo}"

case "${1:-}" in
  '') MODE=(--dry-run) ;;
  --save) MODE=() ;;
  *)
    echo "Usage: backfill-drive-ids.sh [--save]" >&2
    exit 2
    ;;
esac

if [ ! -f "$REPO_DIR/worker/src/tools/backfill-drive-ids.ts" ]; then
  echo "The backfill tool is not in $REPO_DIR yet: update this worker first (update-worker.sh)." >&2
  exit 1
fi

keychain() {
  security find-generic-password -a aivideo -s "$1" -w
}

# shellcheck source=/dev/null
set -a && source "$CONFIG_FILE" && set +a

: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}"

DATABASE_URL="postgres://${DB_USER}:$(keychain aivideo-db-password)@${DB_HOST}:5432/${DB_NAME}"
export DATABASE_URL
if RCLONE_CONFIG_PASS="$(keychain aivideo-rclone-config-pass 2>/dev/null)"; then
  export RCLONE_CONFIG_PASS
fi

cd "$REPO_DIR/worker"
exec npx tsx src/tools/backfill-drive-ids.ts ${MODE[@]+"${MODE[@]}"}
