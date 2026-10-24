#!/usr/bin/env bash
# launchd entry point for the worker on a Mac. Non-secret settings come from
# ~/.config/aivideo/worker.env; secrets are read from the login Keychain at start-up and only
# live in this process's environment (docs/security.md §1). Nothing secret is written to disk.
#
# Keychain items (service names), all with account "aivideo":
#   aivideo-db-password       password of the worker's PostgreSQL login role
#   aivideo-redis-password    password of the worker's Redis ACL user
#   aivideo-api-key-n8n       HMAC key shared with n8n for the worker API
#   aivideo-itera-api-key     ITERA TTS API key (optional: without it tts jobs wait as BLOCKED)
set -euo pipefail

CONFIG_FILE="${AIVIDEO_CONFIG:-$HOME/.config/aivideo/worker.env}"
REPO_DIR="${AIVIDEO_REPO:-$HOME/ai-video-pipeline}"

keychain() {
  security find-generic-password -a aivideo -s "$1" -w
}

# shellcheck source=/dev/null
set -a && source "$CONFIG_FILE" && set +a

: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${REDIS_HOST:?}" "${REDIS_USER:?}"

# Generated passwords are hex (openssl rand -hex 32), so they are URL-safe.
DATABASE_URL="postgres://${DB_USER}:$(keychain aivideo-db-password)@${DB_HOST}:5432/${DB_NAME}"
REDIS_URL="redis://${REDIS_USER}:$(keychain aivideo-redis-password)@${REDIS_HOST}:6379/${REDIS_DB:-1}"
API_CLIENT_KEYS="{\"n8n\":\"$(keychain aivideo-api-key-n8n)\"}"
export DATABASE_URL REDIS_URL API_CLIENT_KEYS
if ITERA_API_KEY="$(keychain aivideo-itera-api-key 2>/dev/null)"; then
  export ITERA_API_KEY
fi

cd "$REPO_DIR/worker"
exec npx tsx src/main.ts
