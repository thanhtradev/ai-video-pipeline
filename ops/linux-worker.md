# Adding a Linux worker: HP ProDesk 400 G7 on Proxmox (D-075)

Run by the user, in order (CLAUDE.md §3). Conventions as in [README.md](README.md). **Free**: no paid
API is called until the smoke test (§9), which costs what one normal video costs.

Machine: HP ProDesk 400 G7, Core i5-10500 (6 cores / 12 threads, no discrete GPU), 16 GB RAM
(user, 2026-10-29). Worker id **`hp-400-g7`** (Postgres role `aivideo_worker_hp_400_g7`, Redis user
`aivideo-worker-hp-400-g7`).

**Prerequisite: D-074 is live** (`ops/worker-affinity.md`). Without the per-video pin, a second
worker would take steps of videos whose files sit on the Mac mini, and those steps would fail.

Values marked `<…>` are not known yet; record them in `docs/infrastructure.md` (U-23) as you go.

## 1. Proxmox and the VM

1. Install Proxmox VE on the HP (or join it to the existing cluster on `192.168.1.111`, your
   choice; the worker does not need the cluster).
2. Create an **Ubuntu Server 24.04 VM** (a VM, not an LXC: bubblewrap and Chrome need user
   namespaces, which an unprivileged LXC only gives with nesting tweaks) with
   [`proxmox/create-linux-worker-vm.sh`](proxmox/create-linux-worker-vm.sh), run as root on the
   HP node after reading it (copy it over with `scp`):
   - CPU type **host**, 12 vCPU (the i5's 12 threads); RAM 13 GB, ballooning off.
   - Disks: the HP has only a 128 GB NVMe (S-30), so a 64 GB system disk goes on `local-lvm`
     (SSD) and a separate 250 GB `WORK_ROOT` disk on `data` (HDD; `WORK_ROOT` keeps finished
     videos until the owner approves cleanup, R-06). The script prints how to mount it.
   - Network on `vmbr0` with a **fixed LAN address** (default `192.168.1.223`, VMID 223, next to the node's `.222`): Postgres
     and Redis allow clients by LAN address. Cloud-init creates the user **`aivideo`** (the systemd
     unit and examples assume `/home/aivideo`) with your SSH key, no password.
   - Start at boot: **on**.
3. In the VM: `sudo apt update && sudo apt full-upgrade`, the guest agent and work disk as the
   script prints, then Tailscale (`tailscale up`) and note `tailscale ip -4` → `<VM tailscale IP>`.

## 2. Packages

```bash
sudo apt install -y git curl build-essential cmake ffmpeg bubblewrap socat \
  libnss3 libdbus-1-3 libatk1.0-0t64 libatk-bridge2.0-0t64 libgbm1 libasound2t64 libxrandr2 \
  libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2t64 \
  fonts-noto-core
curl https://rclone.org/install.sh | sudo bash
```

The `lib*` packages are what Remotion's Chrome Headless Shell needs on Ubuntu; if
`npx remotion browser ensure` or the first render names another missing library, install it.

**Node**: the same major version as the Mac mini (`node -v` there; S-10). With nvm, the systemd
unit does not see it, so add its directory to the unit's PATH in §5.

**bubblewrap check** (Ubuntu 24.04 may block unprivileged user namespaces through AppArmor):

```bash
bwrap --ro-bind / / --dev /dev --proc /proc --unshare-net --unshare-pid -- /bin/true && echo OK
```

If it prints `setting up uid map: Permission denied`, allow bwrap only (not every program):

```bash
sudo tee /etc/apparmor.d/bwrap <<'EOF'
abi <abi/4.0>,
include <tunables/global>
profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
}
EOF
sudo systemctl reload apparmor
```

## 3. Runtime root (D-065)

As `aivideo`:

```bash
mkdir -p ~/aivideo/{config/secrets,logs,models/whisper,media,work} && chmod 700 ~/aivideo/config/secrets
gh repo clone thanhtradev/ai-video-pipeline ~/aivideo/repo -- --branch main   # gh auth login first
cd ~/aivideo/repo && npm ci && (cd remotion && npx remotion browser ensure)
```

- **whisper.cpp**: `git clone https://github.com/ggml-org/whisper.cpp ~/aivideo/models/whisper.cpp`,
  then `cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j` inside it. Copy the
  model from the Mac mini instead of downloading it again:
  `scp <mac>:aivideo/models/whisper/ggml-large-v3-turbo.bin ~/aivideo/models/whisper/`.
- **Music library**: `rsync -a <mac>:aivideo/media/music/ ~/aivideo/media/music/`.
- **Claude Code**: install the CLI (`which claude` → `CLAUDE_BIN`), then `claude setup-token` in this
  VM and save the token as the secret below. Both workers then share the Max plan (U-14): watch the
  `script written` / usage-limit lines in both logs during the first days.
- **rclone**: copy the Mac's encrypted `rclone.conf` to `~/.config/rclone/rclone.conf` (same
  `aivideo-drive` remote, same config password), then `rclone lsd "aivideo-drive:"`.

## 4. Config and secrets

```bash
cp ~/aivideo/repo/ops/systemd/worker.env.example ~/aivideo/config/worker.env
chmod 600 ~/aivideo/config/worker.env
sed -i "s/REPLACE_WITH_TAILSCALE_IP/<VM tailscale IP>/g" ~/aivideo/config/worker.env
```

Check the paths in it (`which ffmpeg ffprobe rclone claude`). Secrets go into one file each, typed
in without echo or shell history (names as in `ops/systemd/run-worker.sh`):

```bash
cd ~/aivideo/config/secrets
for name in aivideo-db-password aivideo-redis-password aivideo-api-key-n8n \
            aivideo-itera-api-key aivideo-rclone-config-pass aivideo-claude-oauth-token; do
  read -rsp "$name: " value && printf '%s' "$value" > "$name" && chmod 600 "$name"; echo
done
unset value
```

- `aivideo-db-password`, `aivideo-redis-password`: new values from §6 and §7 (`openssl rand -hex 32`).
- `aivideo-api-key-n8n`: **the same key as on the Mac mini** (n8n signs requests with one key);
  copy it from the Mac Keychain (`security find-generic-password -a aivideo -s aivideo-api-key-n8n -w`).
- `aivideo-itera-api-key`, `aivideo-rclone-config-pass`: the same values as on the Mac.

## 5. systemd service

```bash
sudo install -m 644 ~/aivideo/repo/ops/systemd/aivideo-worker.service /etc/systemd/system/
echo 'aivideo ALL=(root) NOPASSWD: /usr/bin/systemctl restart aivideo-worker' \
  | sudo tee /etc/sudoers.d/aivideo-worker && sudo chmod 440 /etc/sudoers.d/aivideo-worker
```

With Node from nvm: `sudo systemctl edit aivideo-worker` and add
`[Service]` / `Environment=PATH=<dirname of $(which node)>:/usr/local/bin:/usr/bin:/bin`.

Do **not** start it yet: Postgres and Redis must accept it first.

## 6. PostgreSQL (LXC 102)

In the container (`su postgres -c psql`), connected to `aivideo`:

```sql
CREATE ROLE aivideo_worker_hp_400_g7 LOGIN IN ROLE aivideo_worker;
\password aivideo_worker_hp_400_g7
```

`pg_hba.conf`: one line **above** the `reject` line (README §2.3), then `systemctl reload postgresql`:

```
host  aivideo  aivideo_worker_hp_400_g7  <VM LAN IP>/32  scram-sha-256
```

## 7. Redis (LXC 112)

As in [redis/README.md](redis/README.md) §3, with the admin password in `REDISCLI_AUTH`:

```bash
PW=$(openssl rand -hex 32)
printf '%s\n' "ACL SETUSER aivideo-worker-hp-400-g7 on >$PW resetkeys ~q:* ~nonce:* resetchannels -@all +lmove +lrem +llen +set +ping +select +info +client|setname" | redis-cli
echo "$PW"; unset PW   # into the VM's aivideo-redis-password file, then clear the screen
redis-cli CONFIG REWRITE
```

## 8. Network and monitoring

- Tailscale ACL (`ops/tailscale/acl-snippet.hujson`): add the host `hp-400-g7: <VM tailscale IP>`
  and `{ "action": "accept", "src": ["lxc-utils"], "dst": ["hp-400-g7:8787"] }`.
- Uptime Kuma: an HTTP monitor on `http://<VM tailscale IP>:8787/health`, like the Mac's.

## 9. Start and check

```bash
sudo systemctl enable --now aivideo-worker
tail -f ~/aivideo/logs/worker.log          # until "worker ready"
curl -fsS http://<VM tailscale IP>:8787/health
cd ~/aivideo/repo/worker && npx vitest run test/integration/sandbox-linux.test.ts   # 3 passed
```

From the Mac (owner login): `SELECT id, capabilities, api_url, last_seen_at FROM worker;` lists
`hp-400-g7` with its URL.

**Smoke test**: send a video while the Mac mini is busy rendering another one, then
`SELECT id, worker_id FROM video ORDER BY created_at DESC LIMIT 2;`: one video per worker. Follow
the HP video to the end: Telegram files arrive (fetched from the HP), the render finishes, archive
works. Record the render and whisper times in `docs/infrastructure.md` and tune `RENDER_CONCURRENCY`
/ `WHISPER_THREADS` (§4) if the VM runs out of memory or is slower than expected.

## Updating

`~/aivideo/repo/ops/systemd/update-worker.sh` (no episode agent running), like the Mac's script.

## Removing the worker

`sudo systemctl disable --now aivideo-worker`. Videos pinned to `hp-400-g7` stop where they are
(WF-08 reports them); finish or cancel them first (`ops/worker-affinity.md`).
