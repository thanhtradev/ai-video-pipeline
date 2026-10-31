#!/bin/sh
# Run telegram-bot-api and nginx as one unprivileged user so nginx can read the 0600 files
# tdlib writes (ACLs do not help: an explicit 0600 create mode zeroes the ACL mask).
# Run inside LXC 107 as root. Idempotent. Runbook: ops/telegram-local-bot-api.md section 2.1.
set -eu

USER_NAME=tgbotapi
DATA_DIR=/var/lib/telegram-bot-api
DROPIN_DIR=/etc/systemd/system/telegram-bot-api.service.d

id "$USER_NAME" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$USER_NAME"

mkdir -p "$DROPIN_DIR"
cat > "$DROPIN_DIR/user.conf" <<CONF
[Service]
User=$USER_NAME
Group=$USER_NAME
CONF

systemctl stop telegram-bot-api
setfacl -R -b "$DATA_DIR" 2>/dev/null || true
chown -R "$USER_NAME:$USER_NAME" "$DATA_DIR" /var/lib/nginx
systemctl daemon-reload
systemctl start telegram-bot-api

sed -i "s/^user .*;/user $USER_NAME;/" /etc/nginx/nginx.conf
nginx -t
systemctl restart nginx

sleep 3
echo "--- result"
systemctl is-active telegram-bot-api nginx
ps -o user=,comm= -C telegram-bot-api
ps -o user= -C nginx | sort | uniq -c
