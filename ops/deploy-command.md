# /deploy rollout (D-100)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
Claude Code never sends `/deploy` and never runs the deployer (CLAUDE.md §3).

What it adds: the owner sends `/deploy`. The bot checks `origin/main` and shows the commit, its
commits and the targets, with Xác nhận and Bỏ qua. After Xác nhận:

1. Each online worker, in id order, stops taking new jobs, waits for what it is running, runs
   `update-worker.sh <commit>`, and takes jobs again.
2. n8n publishes the workflows and restarts, skipped if `n8n/workflows/` is unchanged since the last
   successful deploy.

A message follows when it ends. `/deploy` again shows the one in progress.

It refuses when `main` has a migration the database lacks: **migrations stay manual, with a
backup.** A failure stops the rollout and cancels the rest. It never retries or rolls back by
itself. Limits: drain 2 h, update 30 min.

Data: migration `20261125000400`. Requires the rollouts of D-097 to D-099 first. This PR ships by
hand, since `/deploy` cannot deploy itself.

## 1. Check that `main` is protected

`/deploy` installs whatever is on `main`, so its safety rests on `main` taking changes only through
PRs. Check it, and record the result in `docs/security.md` (status `[UNKNOWN]`):

```bash
gh api repos/thanhtradev/ai-video-pipeline/branches/main/protection
```

## 2. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261125000400`. Re-run `ops/postgres/grants.sql`: workers need the `deploy_*` functions, n8n the
new tables. Then update each worker the usual way with `update-worker.sh`, so `job_start`'s callers
and the deployer code are in place. On a Mac still holding the old script, that first run can end
with `worker did not answer http://127.0.0.1:8787/health` although the restart worked (the old script
checked the wrong address); check `curl http://<tailscale ip>:8787/health`. Later runs use the fix.

## 3. Install the deployer on every worker

**Mac** (Mac mini, `macmini2`):

```bash
cd ~/aivideo/repo
NODE_DIR="$(dirname "$(command -v node)")"
sed -e "s#/Users/aivideo#$HOME#g" -e "s#<string>/opt/homebrew/bin#<string>$NODE_DIR:/opt/homebrew/bin#" ops/launchd/com.aivideo.deployer.plist > ~/Library/LaunchAgents/com.aivideo.deployer.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.aivideo.deployer.plist
```

**Linux** (`hp-400-g7`), as root. The sudoers line lets `update-worker.sh` restart the worker and
nothing else:

```bash
install -m 644 ~aivideo/aivideo/repo/ops/systemd/aivideo-deployer.service /etc/systemd/system/
install -m 644 ~aivideo/aivideo/repo/ops/systemd/aivideo-deployer.timer /etc/systemd/system/
echo 'aivideo ALL=(root) NOPASSWD: /usr/bin/systemctl restart aivideo-worker' > /etc/sudoers.d/aivideo-deployer
chmod 440 /etc/sudoers.d/aivideo-deployer
visudo -c
systemctl daemon-reload
systemctl enable --now aivideo-deployer.timer
```

If Node comes from nvm, add its directory to the service's PATH, as in `linux-worker.md` §5.

Check on each: `tail ~/aivideo/logs/deployer.log` shows no errors. A quiet deployer writes nothing.

## 4. Let the Mac mini publish n8n

Only one deployer publishes n8n and runs the preflight. On the Mac mini:

1. Add `DEPLOY_N8N=1` to `~/aivideo/config/worker.env`, and `PVE_HOST=<ssh alias>` if it is not `pve`.
2. Copy `ops/n8n/deploy.env` to `~/aivideo/repo/ops/n8n/deploy.env` (gitignored).
3. Give it SSH access to Proxmox with a key that needs no passphrase prompt, since launchd has no
   terminal. Whether it has this today is `[UNKNOWN]`. Check it from a non-interactive shell:

   ```bash
   ssh -o BatchMode=yes pve true && echo OK
   ```

4. Keep that key in `~/.ssh`: the episode agent's settings and OS sandbox deny that folder
   (`docs/security.md` §5). A key elsewhere is not covered.

## 5. n8n

`ops/n8n/deploy-workflows.sh wf-06 wf-08` from the dev Mac. Then paste the BotFather block if it
changed (`deploy` stays out of the menu; it appears in `/help`).

## 6. Check

- As a non-owner approver: `/deploy` answers `Chỉ owner mới deploy được.`
- With a docs-only commit on `main` and **nothing running**: `/deploy` shows the commit and targets
  within a minute. Press **Bỏ qua**: `Đã bỏ qua.` Send `/deploy` again and press **Xác nhận**: the
  workers update one by one (`/deploy` shows progress, `/workers` shows them back online), n8n says
  `workflows unchanged`, and `✅ Deploy xong` arrives.
- With a test migration on a branch merged to `main`, `/deploy` refuses and names it. Revert it.
- With a video running on a worker, `/deploy`: that worker shows `DRAINING` until the step ends.

## If it fails

The message names the target and the end of its output; the full output is in the deployer log or
`~/aivideo/logs/`. A worker that failed after `git merge` may be on the new commit and not restarted:
fix the cause, then run `update-worker.sh` on it by hand or send `/deploy` again. To stop deployers,
`launchctl bootout "gui/$(id -u)/com.aivideo.deployer"` or `systemctl disable --now aivideo-deployer.timer`.

## Rollback

Stop every deployer. Re-import the previous `wf-06` and `wf-08`, then `npx dbmate … rollback`.
