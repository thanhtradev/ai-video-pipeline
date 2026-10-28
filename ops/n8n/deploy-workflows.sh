#!/usr/bin/env bash
# Imports and publishes the n8n workflows of n8n/workflows/ on LXC 104 with the n8n CLI inside the
# container (D-068). Run by the user from the dev Mac; Claude Code never runs it (CLAUDE.md §3).
#
#   ops/n8n/deploy-workflows.sh [--dry-run] [--no-publish] [wf-06 wf-13 ...]
#
# Steps: fill the placeholders from ops/n8n/deploy.env, back up every workflow, copy the files
# into the n8n data mount, `n8n import:workflow` (keeps ids, overwrites, deactivates), then
# `n8n publish:workflow` per id in PUBLISH_ORDER, restart the container (CLI changes only reach
# the database) and wait for /healthz. Runbook: ops/n8n/README.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKFLOW_DIR="$REPO_ROOT/n8n/workflows"
ENV_FILE="${N8N_DEPLOY_ENV:-$SCRIPT_DIR/deploy.env}"
CONTAINER_DATA_DIR=/home/node/.n8n
HEALTH_ATTEMPTS=30
HEALTH_SLEEP_SECONDS=2

# WF-99 first (n8n 2.x skips an unpublished error workflow), WF-06 before the workflows whose
# buttons it answers (ops/phase-2a.md, ops/preview-approval.md). Every workflow id must be here.
PUBLISH_ORDER=(
  aivideoWf99Error
  aivideoWf08Watch
  aivideoWf02Disp0
  aivideoWf06TgCbk
  aivideoWf05Apprv
  aivideoWf01Intak
  aivideoWf12Story
  aivideoWf13Prev
  aivideoWf14Final
)

DRY_RUN=0
PUBLISH=1
SELECTED=()
STAGE_DIR=""
STAGED_IDS=()
BACKUP_DIR=""

fail() {
  echo "deploy-workflows: $*" >&2
  exit 1
}

cleanup() {
  [ -n "$STAGE_DIR" ] && rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=1 ;;
      --no-publish) PUBLISH=0 ;;
      --*) fail "unknown option $arg (use --dry-run, --no-publish, or workflow names like wf-06)" ;;
      *) SELECTED+=("$arg") ;;
    esac
  done
}

load_env() {
  [ -f "$ENV_FILE" ] || fail "missing $ENV_FILE (copy ops/n8n/deploy.env.example and fill it in)"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  [[ "${APPROVAL_CHAT_ID:-}" =~ ^-?[0-9]+$ ]] || fail "APPROVAL_CHAT_ID must be the Telegram chat id (integer) in $ENV_FILE"
  [[ "${WORKER_URL:-}" =~ ^https?:// ]] || fail "WORKER_URL must start with http:// or https:// in $ENV_FILE"
  PVE_HOST="${PVE_HOST:-pve}"
  LXC_ID="${LXC_ID:-104}"
  N8N_CONTAINER="${N8N_CONTAINER:-n8n}"
  N8N_DATA_DIR="${N8N_DATA_DIR:-/mnt/data/docker-utils/n8n_data}"
  N8N_HEALTH_URL="${N8N_HEALTH_URL:-http://127.0.0.1:5678/healthz}"
}

check_clean_tree() {
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    fail "refusing: $REPO_ROOT has local changes (deploy only committed workflow files)"
  fi
  local branch sha
  branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  echo "deploying n8n/workflows from $branch@$sha"
  [ "$branch" = main ] || echo "warning: not on main" >&2
}

selected_files() {
  if [ "${#SELECTED[@]}" -eq 0 ]; then
    ls "$WORKFLOW_DIR"/wf-*.json
    return
  fi
  local prefix matches
  for prefix in "${SELECTED[@]}"; do
    matches=$(ls "$WORKFLOW_DIR"/"$prefix"*.json 2>/dev/null || true)
    [ -n "$matches" ] || fail "no workflow file matches '$prefix' in n8n/workflows/"
    echo "$matches"
  done
}

workflow_id() {
  node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id))' "$1"
}

stage_workflows() {
  STAGE_DIR="$(mktemp -d)"
  local file
  while IFS= read -r file; do
    sed -e "s|REPLACE_WITH_APPROVAL_CHAT_ID|$APPROVAL_CHAT_ID|g" \
      -e "s|REPLACE_WITH_WORKER_URL|$WORKER_URL|g" "$file" > "$STAGE_DIR/$(basename "$file")"
    chmod 644 "$STAGE_DIR/$(basename "$file")"
  done < <(selected_files | sort -u)
  local leftover
  leftover="$(grep -l 'REPLACE_WITH_' "$STAGE_DIR"/*.json || true)"
  [ -z "$leftover" ] || fail "unknown placeholder REPLACE_WITH_* left in: $leftover (teach this script about it)"
  order_staged_ids
}

order_staged_ids() {
  local file id staged=" "
  for file in "$STAGE_DIR"/*.json; do
    id="$(workflow_id "$file")"
    case " ${PUBLISH_ORDER[*]} " in
      *" $id "*) staged="$staged$id " ;;
      *) fail "workflow id $id ($(basename "$file")) is not in PUBLISH_ORDER; add it in the right place" ;;
    esac
  done
  for id in "${PUBLISH_ORDER[@]}"; do
    case "$staged" in
      *" $id "*) STAGED_IDS+=("$id") ;;
    esac
  done
  echo "staged ${#STAGED_IDS[@]} workflow(s): ${STAGED_IDS[*]}"
}

remote() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY: ssh $PVE_HOST pct exec $LXC_ID -- $*"
    return
  fi
  ssh "$PVE_HOST" "pct exec $LXC_ID -- $*" < /dev/null
}

n8n_cli() {
  remote docker exec "$N8N_CONTAINER" n8n "$@"
}

backup_workflows() {
  BACKUP_DIR="$CONTAINER_DATA_DIR/backups/workflows/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)"
  echo "backing up all workflows to $BACKUP_DIR"
  n8n_cli export:workflow --backup --output="$BACKUP_DIR/"
}

copy_staged() {
  local dest="$N8N_DATA_DIR/deploy/workflows"
  remote mkdir -p "$dest"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY: tar -C $STAGE_DIR -cf - . | ssh $PVE_HOST pct exec $LXC_ID -- tar -xf - -C $dest"
    return
  fi
  tar -C "$STAGE_DIR" -cf - . | ssh "$PVE_HOST" "pct exec $LXC_ID -- tar -xf - -C $dest"
}

import_workflows() {
  n8n_cli import:workflow --separate --input="$CONTAINER_DATA_DIR/deploy/workflows"
}

publish_workflows() {
  local id
  for id in "${STAGED_IDS[@]}"; do
    n8n_cli publish:workflow --id="$id"
  done
}

restart_and_wait() {
  remote docker restart "$N8N_CONTAINER"
  if [ "$DRY_RUN" -eq 1 ]; then
    remote curl -fsS "$N8N_HEALTH_URL"
    return
  fi
  local attempt
  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if remote curl -fsS "$N8N_HEALTH_URL" > /dev/null 2>&1; then
      echo "n8n healthy after restart (attempt $attempt)"
      return
    fi
    sleep "$HEALTH_SLEEP_SECONDS"
  done
  fail "n8n did not answer $N8N_HEALTH_URL after the restart; check 'docker logs $N8N_CONTAINER' on LXC $LXC_ID"
}

report() {
  if [ "$DRY_RUN" -eq 1 ]; then
    n8n_cli export:workflow --all
    return
  fi
  n8n_cli export:workflow --all | node -e '
    const ids = new Set(process.argv.slice(1));
    const raw = require("fs").readFileSync(0, "utf8").trim();
    if (!raw) { console.log("(export:workflow --all returned nothing; check the state in the n8n UI)"); process.exit(0); }
    for (const wf of JSON.parse(raw)) {
      if (!ids.has(wf.id)) continue;
      console.log(`${wf.id}  ${wf.active ? "published    " : "NOT PUBLISHED"}  ${wf.name}`);
    }
  ' "${STAGED_IDS[@]}"
  echo "rollback: n8n import:workflow --separate --input=$BACKUP_DIR then publish:workflow per id"
}

main() {
  parse_args "$@"
  load_env
  check_clean_tree
  stage_workflows
  backup_workflows
  copy_staged
  import_workflows
  if [ "$PUBLISH" -eq 1 ]; then
    publish_workflows
    restart_and_wait
  else
    echo "--no-publish: imported as drafts; publish and restart skipped"
  fi
  report
}

main "$@"
