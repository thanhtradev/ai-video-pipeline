#!/usr/bin/env bash
# Updates the worker's clone to the latest main and restarts the LaunchAgent (D-039 rule, D-065
# layout): the worker loads code once at start, so it is restarted only from an up-to-date main.
# Run by the user on the worker Mac: ~/aivideo/repo/ops/launchd/update-worker.sh
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
REPO_DIR="$AIVIDEO_ROOT/repo"
LABEL=com.aivideo.worker

cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "refusing: $REPO_DIR has local changes (it must be a plain clone of main)" >&2
  exit 1
fi
git fetch origin
git checkout main
git pull --ff-only
npm ci
(cd remotion && npx remotion browser ensure)
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 5
API_PORT="$(grep '^API_PORT=' "$AIVIDEO_ROOT/config/worker.env" | cut -d= -f2- || true)"
curl -fsS "http://127.0.0.1:${API_PORT:-8787}/health" && echo
echo "worker restarted from $(git rev-parse --short HEAD); log: $AIVIDEO_ROOT/logs/worker.log"
