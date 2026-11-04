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

`[UNKNOWN]` until this runs: tests use a fake rclone. On the Mac mini, this finds a real archived video
and only reads Drive:

```bash
export RCLONE_CONFIG_PASS="$(security find-generic-password -a aivideo -s aivideo-rclone-config-pass -w)"
ROOT="aivideo-drive:AI Video Archive"
FILE="$(rclone lsf -R --files-only --include 'final_1080p.mp4' "$ROOT" | head -1)"
echo "Found: $FILE"
rclone lsjson --stat "$ROOT/$FILE"
rclone lsjson --stat "$ROOT/${FILE%/renders/final_1080p.mp4}"
unset RCLONE_CONFIG_PASS
```

The file must show an `ID`. Open `https://drive.google.com/file/d/<ID>/view` signed in to the owner's
account: the video opens. If the folder shows no `ID`, the library works without its Folder link. An
empty `Found:` means this login sees no final video, so try another worker.

## 4. Fill in older videos

**Needs §1 and §2 first:** the migration applied and this worker updated, or the tool isn't there yet.

On the Mac mini, a dry run, which writes nothing:

```bash
~/aivideo/repo/ops/launchd/backfill-drive-ids.sh
```

Then to save the ids:

```bash
~/aivideo/repo/ops/launchd/backfill-drive-ids.sh --save
```

The last line reports `found`, `saved`, `missing` and `failed`, and running it again only retries what
is still empty.

`[UNKNOWN]`: whether all three workers use the same Drive remote. With scope `drive.file`, rclone sees
only what its own login created, so a video archived through another login shows under `missing`. Run
the script on the Mac worker that archived it. The script is for Macs: on `hp-400-g7`, secrets are
read differently (`ops/systemd/run-worker.sh`). Anything still missing stays listed as "No Drive link
yet".

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
