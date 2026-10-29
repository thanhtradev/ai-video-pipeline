#!/usr/bin/env bash
# Updates the worker's clone to the latest main and restarts the systemd service (D-075; the
# macOS counterpart is ops/launchd/update-worker.sh). Run as the worker user on the Linux machine:
# ~/aivideo/repo/ops/systemd/update-worker.sh (restarting needs the sudo rule from
# ops/linux-worker.md §5).
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
REPO_DIR="$AIVIDEO_ROOT/repo"
SERVICE=aivideo-worker

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
sudo systemctl restart "$SERVICE"
sleep 5
API_PORT="$(grep '^API_PORT=' "$AIVIDEO_ROOT/config/worker.env" | cut -d= -f2- || true)"
API_HOST="$(grep '^API_HOST=' "$AIVIDEO_ROOT/config/worker.env" | cut -d= -f2- || true)"
curl -fsS "http://${API_HOST:-127.0.0.1}:${API_PORT:-8787}/health" && echo
echo "worker restarted from $(git rev-parse --short HEAD); log: $AIVIDEO_ROOT/logs/worker.log"
