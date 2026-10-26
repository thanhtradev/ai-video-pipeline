# Storage, NAS, checksum, retention, manifest

## 1. Rules [CONFIRMED]

- Mac SSD is the working area; NAS is the archive. Interim NAS: LXC 106 Nextcloud, on the same disk as production until a dedicated NAS is bought (D-033, R-01).
- Verify file count, size, and checksum before treating an archive as successful.
- Never delete the Mac copy before NAS verification succeeds.
- Keep the Mac working copy for 30 days after a successful NAS transfer.
- Never delete files automatically: warn and ask for approval.
- Daily backups, 30-day retention, backup before upgrades, restores must be tested.

## 2. Output formats [CONFIRMED]

| Type | Spec |
|---|---|
| Final | MP4, H.264 + AAC, 1080p, 30 FPS (MVP: 9:16 Shorts, 1080×1920, < 60s — D-025) |
| Preview | 720p (same codec/FPS — `[PROPOSED]`) |
| Aspect ratio | 16:9 (1920×1080) or 9:16 (1080×1920); one ratio per video |
| Subtitles | SRT and VTT |

## 3. Directory layout [PROPOSED; episodes implemented by D-062, see docs/episode-pipeline.md §10]

`WORK_ROOT` on Mac and `ARCHIVE_ROOT` on NAS: `[UNKNOWN]` (U-04, U-05; Mac mini has ~31 GiB free, R-06).

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
2. Copy to NAS into a temp directory `…/v{n}.partial/` through the storage adapter (WebDAV for interim Nextcloud per D-036, SMB for the future NAS — P-013).
   WebDAV notes: create folders with `MKCOL`, upload with `PUT`, list file count/size with `PROPFIND`, rename with `MOVE`. Nextcloud does not compute SHA-256 server-side, so step 3 verifies by **downloading each file back and hashing it** on the worker.
3. Verify on NAS: file count, total size, SHA-256 of each file matches `checksums.sha256`.
4. Rename `.partial` → `v{n}` (atomic within the same share).
5. Write `archive_record` (path, file_count, total_bytes, manifest checksum, verified_at) → `ARCHIVE_VERIFIED`.
6. Any failure: keep the Mac copy untouched, notify Telegram, no infinite retry.

## 5. Retention [PROPOSED implementation / CONFIRMED rule]

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
