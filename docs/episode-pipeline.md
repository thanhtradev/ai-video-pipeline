# Episode pipeline (TikTok 2 channel) [PROPOSED]

How one 16:9 episode in the TikTok 2 style (D-050) goes from a topic to a rendered MP4 with no
interactive session. Reference process (manual, EP1–EP5): `docs/video-process-export.md`.
Decisions: D-050 (format/style), D-051 (kit port), D-052 (automated step 5, storyboard approval), D-053 (agent sandbox and limits), D-054 (renders run by the worker).

## 1. Flow

```
form (topic | full brief)
  → script        q:light   Claude text-only → episode script JSON            → A1 (Telegram, + TTS estimate)
  → tts           q:light   ITERA eleven_v4, one request per act (audio tags kept)
  → timing        q:heavy   concat → whisper.cpp word times → line/shot timeline → cut check
  → episode_code  q:render  Claude Code headless in a sandboxed workspace → code + SFX
                            → worker gates (typecheck, cut check, text bounds, storyboard)
  → STORYBOARD approval     Telegram: storyboard pages + Approve / Feedback (≤ 3 feedback rounds)
       └─ feedback → new episode_code job with the feedback and the previous code
  → render_preview q:render 720p MP4 + SRT, loudness -14 LUFS (then 2d: QA, A2, final 1080p, archive)
```

Each step is a job with a checkpoint (`checkpoint.json`) and an idempotency key; re-running a
step never repeats a paid call (only `tts` is paid).

## 2. Video status

New status `AWAITING_STORYBOARD_APPROVAL` and approval type `STORYBOARD`:

| From | To | When |
|---|---|---|
| `GENERATING_ASSETS` | `AWAITING_STORYBOARD_APPROVAL` | episode_code succeeded and its gates passed |
| `AWAITING_STORYBOARD_APPROVAL` | `GENERATING_ASSETS` | feedback: a revision job is created |
| `AWAITING_STORYBOARD_APPROVAL` | `RENDERING_PREVIEW` | approved: render_preview becomes READY |

A fourth feedback, an episode_code job that keeps failing its gates, or a 90-minute timeout →
`NEEDS_DECISION` (the user can still open an interactive session on the job workspace).

## 3. Script (A1)

The script step returns one JSON document (schema in `worker/src/handlers/episode-script.ts`):

- `title`, `logline` (shown in A1), `characters[]` (`name`, `look`), `effects` (Markdown);
- `acts[]` (1–12): `title`, `grade` (colour note), `lines[]` (narration with ElevenLabs audio tags
  such as `[punchy]`), `shots[]` (`id` "act.n", `moc` = first words of the line it starts on,
  `description`, optional `hold_seconds`, `sfx[]`).

Line ids `L001…` are assigned in order by SQL, not by the model. From a full brief in the user's
format (VOICE / NHÂN VẬT / VISUAL STYLE / HIỆU ỨNG / DANH SÁCH SHOT), Claude only restructures it
and keeps the Vietnamese text verbatim; from a topic it writes the episode.

## 4. TTS

Model `eleven_v4` (1 credit/char, ≤ 10000 chars per request), Vietnamese voice
`47rM9DW5VmjOw23BVHWi`, enabled by a rollout SQL like `ops/postgres/itera-tts.sql`. One request
per act: an act's lines joined with newlines, tags included. The A1 estimate counts the same text.

## 5. Timing

Port of `scripts/tiktok2/ep1/build_timing.py` + `check_cuts.py` to the worker:
act clips → `voice.wav` (48 kHz) and a 16 kHz copy → `whisper-cli` (large-v3-turbo, `-l vi`,
word timestamps) → align the known line texts (tags stripped) to the words → boundary of each
line = nearest silence run → shots placed on their `moc`, holds and gaps (0.15–0.38 s) applied →
`timing.json`, `captions.json`. A cut that lands in speech fails the job (bounded retries).

## 6. Episode code (Claude Code headless)

Workspace `jobs/<job>/ws/`, prepared by the worker:

```
CLAUDE.md               channel rules (style, logic lock, text-in-frame, mix, timing API)
brief.md                the approved script, rendered as the user's brief format
data/timing.json …      from the timing job
kit/  (read-only)       remotion/src/tiktok2/ep1 shared kit + EP2/EP3/EP5 as examples
src/episode/            Claude writes here: kit.tsx, sets.tsx, shots/act*.tsx, audio.tsx
sfx/generate-sfx.mjs    Claude writes; the worker runs it (deterministic synthesis)
```

`claude -p` with model `claude-opus-5-5`, `--permission-mode dontAsk`, an allow-list of tools
(Read, Write, Edit, Glob, Grep, Bash for `npm run check|sfx` only), no MCP, a 90-minute
timeout, the worker's environment stripped of secrets, and the **macOS sandbox**:
writes only inside the workspace, no network (`strictAllowlist`, no domains), no unsandboxed
fallback (`allowUnsandboxedCommands: false`, `failIfUnavailable: true`), reads of `~/.ssh`,
`~/.config/aivideo`, Keychain and `.env*` denied. Fonts come from `@fontsource` packages so the
render needs no network. The transcript is kept in the workspace.

Chrome cannot start inside Claude Code's sandbox (it needs Mach bootstrap ports; spike C1,
2026-10-26), and `excludedCommands` does not lift the sandbox while `allowUnsandboxedCommands` is
false. So the agent never renders (D-054). Remotion always launches Chrome with `--no-sandbox`, so
every render of agent-written code is run **by the worker** under its own Seatbelt profile
`ops/claude/episode-render.sb`: loopback only (no DNS, no egress), writes only in the workspace,
secret paths unreadable, `TMPDIR` inside the workspace.

Worker gates after Claude stops (the agent's own claims are not trusted):
`tsc` on the workspace, timeline cut check, text-out-of-frame check (0 sharp hits), storyboard
render (12 shots per page). The storyboard pages are written to `board/` and the session is
resumed so the agent reviews them (the Read tool shows images) and fixes what it sees; a failed
gate resumes it with the report. At most 2 resumed turns, all inside the 90-minute limit.

## 7. Storyboard approval

The STORYBOARD approval is bound to `video_id` + version + token + SHA-256 of the storyboard
pages, like A1. n8n sends the pages (fetched from the worker API with an HMAC signature) as a
Telegram media group with **Approve** / **Feedback** buttons; Feedback asks for a text reply,
which becomes the next episode_code job's input together with the previous code.

## 8. Render

`render_preview` renders the episode composition from the approved workspace: audio WAV, muted
video (ANGLE GPU, 8 tabs), ffmpeg mux, two-pass loudnorm (-14 LUFS, -1.5 dBTP), burned-in
captions, sidecar SRT from the word timings.

## 9. Rollout slices

| Slice | Content | User rollout |
|---|---|---|
| B1 | episode script schema + prompt, form fields, A1 message | migration, WF-01/WF-05 import |
| B2 | `eleven_v4` + voice, per-act TTS | migration, `itera-tts.sql` |
| B3 | timing job (whisper.cpp + port of build_timing/check_cuts) | `brew install whisper-cpp`, model download |
| C1 | ✅ sandbox spike (D-054), fonts bundled via `@fontsource` | — |
| C2 | episode_code job, workspace, gates | migration |
| C3 | STORYBOARD approval + Telegram media group + feedback loop | migration, WF import |
| C4 | render_preview on the episode composition | — |
