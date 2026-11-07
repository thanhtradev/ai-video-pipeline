#!/usr/bin/env bash
# systemd entry point for the worker on Linux (D-075); same layout as ops/launchd/run-worker.sh
# (D-065 runtime root, default ~/aivideo), but secrets come from files instead of the Keychain:
# $AIVIDEO_ROOT/config/secrets/<name>, directory 700 and files 600, owned by the worker user.
# config/ is hidden from the episode sandboxes (bubblewrap, Claude Code), so the agent cannot
# read them. Secrets only live in this process's environment (docs/security.md §1).
#
# Secret files (same names as the macOS Keychain items):
#   aivideo-db-password       password of the worker's PostgreSQL login role
#   aivideo-redis-password    password of the worker's Redis ACL user
#   aivideo-api-key-n8n       HMAC key shared with n8n for the worker API
#   aivideo-itera-api-key     ITERA TTS API key (optional: without it tts jobs wait as BLOCKED)
#   aivideo-rclone-config-pass  password of the encrypted rclone config (optional)
#   aivideo-archive-password  Nextcloud app password (only for the Nextcloud archive, D-062)
#   aivideo-claude-oauth-token  long-lived token from `claude setup-token` (D-046)
set -euo pipefail

AIVIDEO_ROOT="${AIVIDEO_ROOT:-$HOME/aivideo}"
CONFIG_FILE="${AIVIDEO_CONFIG:-$AIVIDEO_ROOT/config/worker.env}"
REPO_DIR="${AIVIDEO_REPO:-$AIVIDEO_ROOT/repo}"
SECRETS_DIR="$AIVIDEO_ROOT/config/secrets"
export AIVIDEO_ROOT

secret() {
  local file="$SECRETS_DIR/$1"
  [ -r "$file" ] || return 1
  tr -d '\n' < "$file"
}

required_secret() {
  secret "$1" || { echo "missing secret file $SECRETS_DIR/$1" >&2; exit 1; }
}

if [ -n "$(find "$SECRETS_DIR" -maxdepth 1 -perm /077 2>/dev/null)" ]; then
  echo "refusing: $SECRETS_DIR or a file in it is readable by group/others (chmod 700/600)" >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a && source "$CONFIG_FILE" && set +a

: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${REDIS_HOST:?}" "${REDIS_USER:?}"

# Generated passwords are hex (openssl rand -hex 32), so they are URL-safe.
DATABASE_URL="postgres://${DB_USER}:$(required_secret aivideo-db-password)@${DB_HOST}:5432/${DB_NAME}"
REDIS_URL="redis://${REDIS_USER}:$(required_secret aivideo-redis-password)@${REDIS_HOST}:6379/${REDIS_DB:-1}"
API_CLIENT_KEYS="{\"n8n\":\"$(required_secret aivideo-api-key-n8n)\"}"
export DATABASE_URL REDIS_URL API_CLIENT_KEYS
if ITERA_API_KEY="$(secret aivideo-itera-api-key)"; then
  export ITERA_API_KEY
fi
if RCLONE_CONFIG_PASS="$(secret aivideo-rclone-config-pass)"; then
  export RCLONE_CONFIG_PASS
fi
if ARCHIVE_WEBDAV_PASSWORD="$(secret aivideo-archive-password)"; then
  export ARCHIVE_WEBDAV_PASSWORD
fi
if CLAUDE_CODE_OAUTH_TOKEN="$(secret aivideo-claude-oauth-token)"; then
  export CLAUDE_CODE_OAUTH_TOKEN
fi

cd "$REPO_DIR/worker"
exec npx tsx src/main.ts
