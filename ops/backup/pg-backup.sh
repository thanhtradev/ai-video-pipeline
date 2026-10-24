#!/usr/bin/env bash
# Daily logical backup of the pipeline database (D-015, D-031). Runs on LXC 102 as the postgres
# OS user (peer auth, no password). Connection uses standard PG* environment variables.
#
#   pg-backup.sh            # dump + verify + checksum
#   pg-backup.sh --prune    # also delete dumps older than RETENTION_DAYS (approved policy D-015)
set -euo pipefail

DB_NAME="${DB_NAME:-aivideo}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/postgresql/backups/${DB_NAME}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PRUNE=false
[[ "${1:-}" == "--prune" ]] && PRUNE=true

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="${BACKUP_DIR}/${DB_NAME}-${stamp}.dump"
partial="${BACKUP_DIR}/.${DB_NAME}-${stamp}.dump.partial"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
trap 'rm -f "$partial"' EXIT

pg_dump --format=custom --file="$partial" "$DB_NAME"
# A dump that pg_restore cannot list is not a backup.
pg_restore --list "$partial" >/dev/null
mv "$partial" "$final"
echo "$(sha256 "$final")  $(basename "$final")" >"${final}.sha256"
pg_dumpall --globals-only --no-role-passwords >"${BACKUP_DIR}/globals-${stamp}.sql"

echo "backup ok: ${final} ($(wc -c <"$final" | tr -d ' ') bytes)"

if $PRUNE; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name "${DB_NAME}-*.dump" -o -name "${DB_NAME}-*.dump.sha256" -o -name 'globals-*.sql' \) \
    -mtime +"$RETENTION_DAYS" -print -delete
fi
