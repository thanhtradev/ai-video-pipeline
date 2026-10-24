#!/usr/bin/env bash
# Restore test (D-031: monthly and before upgrades). Restores the newest dump into a scratch
# database, compares table row counts and migration version with the live database, then drops
# only the scratch database it created. Never touches the live database.
set -euo pipefail

DB_NAME="${DB_NAME:-aivideo}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/postgresql/backups/${DB_NAME}}"
TEST_DB="${DB_NAME}_restore_test"

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

latest="$(ls -1t "${BACKUP_DIR}/${DB_NAME}"-*.dump 2>/dev/null | head -n 1)"
[[ -n "$latest" ]] || { echo "no dump found in ${BACKUP_DIR}" >&2; exit 1; }

expected="$(cut -d' ' -f1 "${latest}.sha256")"
[[ "$(sha256 "$latest")" == "$expected" ]] || { echo "checksum mismatch for ${latest}" >&2; exit 1; }

if psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB}'" postgres | grep -q 1; then
  echo "${TEST_DB} already exists; remove it by hand after checking why" >&2
  exit 1
fi

createdb "$TEST_DB"
trap 'dropdb --if-exists "$TEST_DB"' EXIT
pg_restore --no-owner --exit-on-error --dbname="$TEST_DB" "$latest"

# Row counts per table in a stable order.
counts_sql="SELECT string_agg(format('%s=%s', relname, n_live_tup), ',' ORDER BY relname)
            FROM pg_stat_user_tables"
version_sql="SELECT max(version) FROM schema_migrations"
psql -qtAc 'ANALYZE' "$TEST_DB"

# Only pipeline databases have dbmate's schema_migrations table.
restored_version="n/a"
live_version="n/a"
if [[ "$(psql -tAc "SELECT to_regclass('public.schema_migrations') IS NOT NULL" "$TEST_DB")" == "t" ]]; then
  restored_version="$(psql -tAc "$version_sql" "$TEST_DB")"
  live_version="$(psql -tAc "$version_sql" "$DB_NAME")"
fi
restored_tables="$(psql -tAc "SELECT count(*) FROM pg_stat_user_tables" "$TEST_DB")"

echo "dump:              $(basename "$latest")"
echo "migration version: restored=${restored_version} live=${live_version}"
echo "tables restored:   ${restored_tables}"
echo "row counts:        $(psql -tAc "$counts_sql" "$TEST_DB")"

[[ "$restored_version" == "$live_version" ]] || { echo "RESTORE TEST FAILED: version differs" >&2; exit 1; }
[[ "$restored_tables" -gt 0 ]] || { echo "RESTORE TEST FAILED: no tables" >&2; exit 1; }
echo "RESTORE TEST PASSED"
