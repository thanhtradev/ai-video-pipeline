#!/usr/bin/env bash
# Updates the worker's clone to the latest main and restarts the LaunchAgent (D-039 rule, D-065
# layout): the worker loads code once at start, so it is restarted only from an up-to-date main.
# Run by the user on the worker Mac: ~/aivideo/repo/ops/launchd/update-worker.sh
# With a commit id (the deployer, D-100): fast-forwards to exactly that commit.
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
REPO_DIR="$AIVIDEO_ROOT/repo"
LABEL=com.aivideo.worker

SHA="${1:-}"
HEALTH_ATTEMPTS=24
HEALTH_SLEEP_SECONDS=5

# A restart takes a while to answer; /deploy runs this with nobody watching (D-100).
wait_healthy() {
  local attempt
  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if curl -fsS "$1"; then
      echo
      return 0
    fi
    sleep "$HEALTH_SLEEP_SECONDS"
  done
  echo "worker did not answer $1 after the restart" >&2
  return 1
}

cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "refusing: $REPO_DIR has local changes (it must be a plain clone of main)" >&2
  exit 1
fi
git fetch origin
git checkout main
if [ -n "$SHA" ]; then
  git merge --ff-only "$SHA"
else
  git pull --ff-only
fi
npm ci
(cd remotion && npx remotion browser ensure)
launchctl kickstart -k "gui/$(id -u)/$LABEL"
API_PORT="$(grep '^API_PORT=' "$AIVIDEO_ROOT/config/worker.env" | cut -d= -f2- || true)"
API_HOST="$(grep '^API_HOST=' "$AIVIDEO_ROOT/config/worker.env" | cut -d= -f2- || true)"
wait_healthy "http://${API_HOST:-127.0.0.1}:${API_PORT:-8787}/health"
echo "worker restarted from $(git rev-parse --short HEAD); log: $AIVIDEO_ROOT/logs/worker.log"
