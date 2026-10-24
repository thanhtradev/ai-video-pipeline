# Redis on LXC 112

Survey (S-03): Redis 7.0.15, `requirepass` set, **no AOF, no `maxmemory`** (R-03).
The pipeline only needs the keys `q:*` and `nonce:*` in its own logical database (`REDIS_DB=1`).

Run these on LXC 112. Provide the admin password via `REDISCLI_AUTH` so it never appears in the
process list or shell history:

```bash
read -rs REDISCLI_AUTH && export REDISCLI_AUTH
```

## 1. Check other users first (U-03)

Eviction and memory settings are server-wide. Before changing them, see who else uses Redis:

```bash
redis-cli INFO keyspace
redis-cli CLIENT LIST | awk '{print $2, $3, $NF}'
```

If another application uses Redis as a cache that relies on eviction, stop and decide with the
owner: `noeviction` would make that cache fail when full instead of evicting.

## 2. Persistence and memory limit

LXC 112 has 1 GiB RAM. The pipeline stores only job ids and nonces (kilobytes).

```bash
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET appendfsync everysec
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy noeviction
redis-cli CONFIG REWRITE
```

Verify: `INFO persistence` shows `aof_enabled:1`; `CONFIG GET maxmemory*`.

## 3. ACL users

Generate one password per user and pipe the substituted commands straight into `redis-cli`
(it reads one command per line; nothing is written to disk or passed through the shell, which
matters because rules like `+client|setname` contain `|`):

```bash
N8N_PW=$(openssl rand -hex 32); WORKER_PW=$(openssl rand -hex 32)
sed -e "s/__N8N_PASSWORD__/$N8N_PW/" -e "s/__WORKER_PASSWORD__/$WORKER_PW/" acl-setup.redis \
  | grep '^ACL SETUSER' | redis-cli
echo "n8n: $N8N_PW"; echo "worker: $WORKER_PW"   # copy into the n8n credential / Mac Keychain, then clear the screen
unset N8N_PW WORKER_PW
redis-cli CONFIG REWRITE   # or ACL SAVE if an aclfile is configured
```

The rules are covered by `worker/test/integration/redis-acl.test.ts`: n8n can only `RPUSH`;
the worker can only move/remove queue messages and set nonces; neither can read other keys or
run admin commands.

## 4. Network

Redis listens on all interfaces (`bind 0.0.0.0`). Restrict TCP 6379 on LXC 112 to
LXC 104 (`192.168.1.104`) and the Mac mini, or add LXC 112 to the tailnet (R-05, Q-017).
