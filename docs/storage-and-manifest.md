# Storage, NAS, checksum, retention, manifest

## 1. Rules [CONFIRMED]

- Mac SSD is the working area; the archive is **Google Drive** (personal account, through rclone, D-063). Nextcloud on LXC 106 (D-033) remains only as a fallback target; its disk is now 128 GB.
- Verify file count, size, and checksum before treating an archive as successful.
- Never delete the Mac copy before archive verification succeeds.
- After a verified archive the owner is asked on Telegram whether to delete the Mac copy now (D-063, replaces the 30-day rule); only the owner's approval deletes it, after a fresh verification of the remote copy.
- Never delete files automatically: warn and ask for approval.
- Daily backups, 30-day retention, backup before upgrades, restores must be tested.

## 2. Output formats [CONFIRMED]

| Type | Spec |
|---|---|
| Final | MP4, H.264 + AAC, 1080p, 30 FPS (MVP: 9:16 Shorts, 1080×1920, < 60s — D-025) |
| Preview | 720p (same codec/FPS — `[PROPOSED]`) |
| Aspect ratio | 16:9 (1920×1080) or 9:16 (1080×1920); one ratio per video, set by the kit (D-080); the manifest takes it from the final render |
| Subtitles | SRT and VTT |

## 3. Directory layout [PROPOSED; episodes implemented by D-062, see docs/episode-pipeline.md §10]

`WORK_ROOT` on a worker Mac: `~/aivideo/work` (D-065, [CONFIRMED] Mac mini 2026-10-28). It is local to each worker, so every job of a video runs on the worker the video is pinned to (D-074). `ARCHIVE_ROOT`: Google Drive through rclone (D-063).

```
<WORK_ROOT>/videos/{video_id}/v{n}/
  brief.json
  script/            script.md, storyboard.json   (video content in Vietnamese)
  prompts/           {step}-{scene}.json   (prompt + params, no secrets)
  assets/
    source/          raw provider output
    approved/        files used in the render
    licenses.json    source, license_status, notes
  audio/             voice/, music/, sfx/, mix.wav
  subtitles/         {lang}.srt, {lang}.vtt
  remotion/          project (src, package.json, lockfile)
  renders/           preview_720p.mp4, final_1080p.mp4
  thumbnail/         thumbnail.png
  metadata/          title, description, tags (json)
  qa/                qa-report.json
  logs/              job logs (redacted)
  jobs/{job_id}/     per-job temp workspace
  manifest.json
```

On NAS: `<ARCHIVE_ROOT>/{yyyy}/{mm}/{video_id}/v{n}/` — same layout, without `jobs/`.

## 4. Archive procedure (`archive` job) [implemented for episodes, D-062]

1. Freeze the version: generate `manifest.json` + `checksums.sha256` (SHA-256 of every file).
2. Copy to the archive into a temp directory `…/v{n}.partial/` through the storage adapter (rclone to Google Drive per D-063; WebDAV for Nextcloud per D-036 as a fallback).
   WebDAV notes: create folders with `MKCOL`, upload with `PUT`, list file count/size with `PROPFIND`, rename with `MOVE`. Nextcloud does not compute SHA-256 server-side, so step 3 verifies by **downloading each file back and hashing it** on the worker.
   rclone notes: each rclone call costs seconds (start-up, config, Drive API), so the upload is one `rclone copy --files-from-raw -` and step 3 reads sizes and Drive's SHA-256 from one `lsjson -R --hash-type sha256`; only files without a listed SHA-256 are hashed one by one (download-and-hash if needed).
3. Verify on NAS: file count, total size, SHA-256 of each file matches `checksums.sha256`.
4. Rename `.partial` → `v{n}` (atomic within the same share).
5. Write `archive_record` (path, file_count, total_bytes, manifest checksum, verified_at) → `ARCHIVE_VERIFIED`.
6. Any failure: keep the Mac copy untouched, notify Telegram, no infinite retry.

## 5. Retention [implemented for episodes by D-063; the WF-10 schedule below is not needed for them]

- `verified_at + 30 days` → WF-10 lists eligible working copies and asks for approval via Telegram.
- Delete only after user approval **and** a fresh NAS checksum re-verification right before deletion.
- NAS copies: no automatic deletion rule.

## 6. Manifest [CONFIRMED content / PROPOSED schema]

```json
{
  "manifest_version": 1,
  "video_id": "…", "version": 2, "config_version": "…",
  "created_at": "…", "aspect_ratio": "16:9",
  "approvals": [{"type": "script", "approval_id": "…", "decided_at": "…"}],
  "steps": [{
    "step": "visuals", "scene": 3, "job_id": "…", "attempt": 1,
    "provider": "…", "model": "…", "model_version": "…",
    "parameters": {}, "seed": 12345,
    "prompt_file": "prompts/visuals-03.json",
    "outputs": [{"path": "remotion/src/scenes/scene-03.json", "sha256": "…", "bytes": 0}],
    "cost": {"amount": 0, "currency": "…"}
  }],
  "voices": [{"provider": "…", "voice_id": "…"}],
  "assets": [{"path": "…", "sha256": "…", "source_url": "…", "license_status": "UNVERIFIED"}],
  "render": {"remotion_version": "…", "composition_id": "…", "width": 1920, "height": 1080,
             "fps": 30, "codec": "h264", "audio_codec": "aac", "crf": null,
             "node_version": "…", "worker_id": "…"},
  "dependencies": {"lockfile": "remotion/package-lock.json", "lockfile_sha256": "…"},
  "checksums_file": "checksums.sha256"
}
```

Record `seed` only when the provider supports it. No secrets.

## 7. Backup [CONFIRMED rule / UNKNOWN current state]

| Target | Proposal |
|---|---|
| PostgreSQL pipeline DB | Daily `pg_dump`, keep 30 days, stored off LXC 102 (NAS) |
| n8n (workflows, encrypted credentials) | Daily export + backup of n8n data dir/DB |
| Redis | AOF/RDB snapshot (not the source of truth; mainly for fast restart) |
| Before upgrades | LXC snapshot + manual dump |
| Restore test | Monthly and before upgrades; first one in Phase 1 (D-031) |

Current backup state: `[UNKNOWN]` (U-10).
