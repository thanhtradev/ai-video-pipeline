# Chíp Khoa học and Telegram-only intake rollout (D-078, D-079)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**

What it changes: the science host is called CHÍP and its character set slug is `chip-science`
(Telegram: "Chíp Khoa học"; `/new … nhanvat=chip-science`); the WF-01 form is gone, every clip
starts with `/new` on Telegram.

## 0. Wait for running science jobs

Old workers look for `characters/bip`. Before migrating, no job of a `bip` clip should be running:

```sql
SELECT j.id, j.step, j.status FROM job j JOIN video_version vv ON vv.id = j.video_version_id
WHERE vv.brief->>'character_set' = 'bip' AND j.status IN ('QUEUED', 'RUNNING');
```

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261112000100`. Check:

```sql
SELECT slug, label FROM catalog_option WHERE kind = 'character_set';  -- chip, chip-science
SELECT count(*) FROM video_version WHERE brief->>'character_set' = 'bip';  -- 0
```

## 2. Workers (right after the migration)

`~/aivideo/repo/ops/launchd/update-worker.sh` on the Mac mini and
`~/aivideo/repo/ops/systemd/update-worker.sh` on the HP worker.

## 3. n8n

`ops/n8n/deploy-workflows.sh wf-06` (the `/brief` prompt names Chíp Khoa học). Then in the n8n UI
deactivate **WF-01 Intake** and delete it; its basic-auth form credential can be deleted too.

## 4. Check

`/new Chíp ơi, tại sao nước sôi?` → **Kit → Khoa học**, **Nhân vật → Chíp Khoa học** → the
confirmation reads `Kit: Khoa học · Nhân vật: Chíp Khoa học`; **Tạo** → the A1 script opens with
"Chíp ơi, tại sao…?" and ends with "Chíp đã hiểu. Còn bạn?". `/brief` lists "Chíp Khoa học".

## Rollback

Restart the workers on the previous code, `npx dbmate … rollback` (slug back to `bip`), re-import
the previous `wf-06-telegram-callback.json` and, if wanted, `wf-01-intake.json` from Git.
