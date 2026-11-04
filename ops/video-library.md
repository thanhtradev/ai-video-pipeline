# Video library rollout (D-104)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free**: Drive is
only read, and nothing about its sharing changes. Claude Code runs none of this (CLAUDE.md §3).

What it adds: a Library page in the web console and `/library` on Telegram, listing every archived
video by kit or by character, with its title and Drive link, including one cancelled after its archive,
because the copy is still on Drive. Links open only for Google accounts with
access to the archive folder.

Data: migration `20261128000100`. It adds two nullable columns and a trigger to `archive_record`.

## 1. Back up, migrate, grant

As in [README.md](README.md) §1 and §2: back up, run the migration, then
`psql "$OWNER_URL" -f ops/postgres/grants.sql`. `/deploy` refuses until the migration is applied.

## 2. Update the code

Update the workers and n8n with `/deploy` or `update-worker.sh` and `ops/n8n/deploy-workflows.sh`.
`/deploy` does not update the console, so on LXC 104:

```bash
git pull
docker compose -f ops/web/compose.yml up -d --build
```

## 3. Check one real link first

`[UNKNOWN]` until this runs: tests use a fake rclone. On the Mac mini, with the path of a real archived
video (from the database, `SELECT path FROM archive_record LIMIT 1`):

```bash
export RCLONE_CONFIG_PASS="$(security find-generic-password -a aivideo -s aivideo-rclone-config-pass -w)"
rclone lsjson --stat "aivideo-drive:AI Video Archive/<path>/renders/final_1080p.mp4"
rclone lsjson --stat "aivideo-drive:AI Video Archive/<path>"
unset RCLONE_CONFIG_PASS
```

The file must show an `ID`. Open `https://drive.google.com/file/d/<ID>/view` signed in to the owner's
account: the video opens. If the folder shows no `ID`, the library works without its Folder link.

## 4. Fill in older videos

Dry run first, then for real, on the Mac mini. Run as one block in `bash`. It reads Drive and writes
only the ids:

```bash
bash <<'SCRIPT'
set -euo pipefail
keychain() { security find-generic-password -a aivideo -s "$1" -w; }
set -a; source ~/aivideo/config/worker.env; set +a
export DATABASE_URL="postgres://${DB_USER}:$(keychain aivideo-db-password)@${DB_HOST}:5432/${DB_NAME}"
export RCLONE_CONFIG_PASS="$(keychain aivideo-rclone-config-pass)"
cd ~/aivideo/repo/worker
npx tsx src/tools/backfill-drive-ids.ts --dry-run
SCRIPT
```

Remove `--dry-run` to save. The last line reports `found`, `saved`, `missing` and `failed`, and running
it again only retries what is still empty.

`[UNKNOWN]`: whether all three workers use the same Drive remote. With scope `drive.file`, rclone sees
only what its own login created, so a video archived through another login shows under `missing`. Run
the tool on the worker that archived it. Anything still missing stays listed as "No Drive link yet".

## 5. Share with other people (optional)

Links open only for accounts with access. To include other approvers, share the `AI Video Archive`
folder with them once in Drive, as Viewer. Files inherit it.

## 6. Check it

1. Send `/library`, then `/library kit=science`. In a group, confirm that a person who is not an
   approver gets no answer.
2. Open Library on the console, switch between Kit and Character, and search.
3. Compare the page with `/library`: same titles and links.
4. Open a link while signed in to the owner's account, then from an account without access, which Drive
   should refuse.
5. Let the next new video reach the archive, and confirm that it appears with a link with no backfill.

## Rollback

Roll back WF-06, the console and the workers first. The migration's down section drops the functions,
trigger and columns. Ids saved by the backfill are lost; run it again if you migrate back up.
