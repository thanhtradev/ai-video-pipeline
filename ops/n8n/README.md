# Deploying the n8n workflows

`ops/n8n/deploy-workflows.sh` replaces the manual "Import from File → save → activate" rounds
(D-068). It is **run by the user** from the dev Mac; Claude Code never runs it (CLAUDE.md §3).

## Prerequisites (once)

- SSH alias `pve` for the Proxmox host (the script hops with `ssh pve 'pct exec 104 -- …'`).
- `cp ops/n8n/deploy.env.example ops/n8n/deploy.env` and fill in `APPROVAL_CHAT_ID` (and
  `WORKER_URL` if the Mac's Tailscale address changed). The file is gitignored.
- The n8n credentials `aivideo-postgres`, `aivideo-redis`, `aivideo-telegram`, `aivideo-form-auth`
  exist with exactly those names (ops/README.md §5.2).
- A clean checkout: the script refuses to run with local changes and warns when not on `main`.

## Run

```bash
ops/n8n/deploy-workflows.sh --dry-run        # print every remote command, touch nothing
ops/n8n/deploy-workflows.sh                  # all workflows: import, publish, restart
ops/n8n/deploy-workflows.sh wf-06 wf-13      # only these files (prefix of the file name)
ops/n8n/deploy-workflows.sh --no-publish     # import as drafts, no publish, no restart
```

What one run does, in order:

1. Stages copies of `n8n/workflows/*.json` with `REPLACE_WITH_APPROVAL_CHAT_ID` and
   `REPLACE_WITH_WORKER_URL` filled in; fails if any other `REPLACE_WITH_` is left.
2. `n8n export:workflow --backup` of **all** workflows into
   `/home/node/.n8n/backups/workflows/pre-deploy-<UTC time>/` inside the container.
3. Copies the staged files to `/mnt/data/docker-utils/n8n_data/deploy/workflows/` (the bind mount,
   `/home/node/.n8n/deploy/workflows/` in the container).
4. `n8n import:workflow --separate`: ids are kept, so the existing workflow with the same id is
   overwritten; n8n deactivates every imported workflow.
5. `n8n publish:workflow --id=…` for each staged workflow, in the fixed order WF-99, 08, 02, 06,
   05, 01, 12, 13, 14 (`PUBLISH_ORDER` in the script; a new workflow must be added there).
6. `docker restart n8n` and polls `/healthz` for up to 60 s. CLI import/publish only write the
   database; without a restart the running instance keeps the old published versions.
7. Prints the published state of the deployed ids from `export:workflow --all` and the backup path.

Expect a gap of about a minute while n8n restarts: WF-02/WF-08 polls resume on their own, WF-06
re-registers the Telegram webhook on start.

## Rollback

Re-import the pre-deploy backup the script printed, then publish and restart:

```bash
ssh pve 'pct exec 104 -- docker exec n8n n8n import:workflow --separate --input=/home/node/.n8n/backups/workflows/pre-deploy-<time>/'
ssh pve 'pct exec 104 -- docker exec n8n n8n publish:workflow --id=aivideoWf99Error'   # and the others
ssh pve 'pct exec 104 -- docker restart n8n'
```

Or check out the previous commit and run the script again.

## First run: two things to confirm `[UNKNOWN]`

Record the answer in `docs/infrastructure.md` with the date and command.

1. **Project ownership.** `import:workflow` takes an optional `--projectId`/`--userId`. If the
   imported workflows do not show up under your user in the UI, rerun with
   `--userId=<id from Settings → Users>` added to `import_workflows` in the script.
2. **Credential mapping.** The repo files reference credential ids such as `aivideoPgCred001`;
   the production credentials were created in the UI with their own ids. n8n's import falls
   back to matching by credential **name and type** (hence the fixed names), but this must be seen
   working once. If a node shows "credential not found", put the real credential ids into the
   JSON files (one-time edit); the script needs no change.
