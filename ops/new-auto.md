# `/new … auto=on` rollout (D-096)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free** in
itself; a video created with `auto=on` runs its paid steps (TTS) without asking, as with `/auto`.
No worker restart.

What it adds: `auto=on` on the first line of `/new` creates the video with `/auto` (D-093) already
on, so there is no `/auto <id>` to send afterwards. The confirmation shows `Tự duyệt: Bật — mọi bước
tới khi lưu Drive (trừ xóa bản trên Mac)`; Tạo turns it on in your name. Example:

```
/new 4 Chíp ơi, tại sao nước nóng đóng băng nhanh hơn nước lạnh? kit=science nhanvat=chip-science worker=mac-mini-m4 auto=on
```

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1; expect
`20261124000100`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`.

## 3. Check

Send a `/new … auto=on`: the confirmation has the `Tự duyệt: Bật` line; after Tạo the first
approval (script) arrives as `🤖 … tự duyệt (/auto)` without buttons. A `/new` without `auto=on`
still asks at every step.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`, then `npx dbmate … rollback` (open drafts
lose the choice; videos already created keep `/auto` until `/auto <id> off`).
