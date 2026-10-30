#!/usr/bin/env bash
# Creates the Ubuntu 24.04 worker VM on the HP Proxmox node (D-075, ops/linux-worker.md §1).
# Run by the user as root on pve-hp400g7 (192.168.1.222), after reading it:
#   SSH_PUBKEY_FILE=/root/aivideo.pub bash create-linux-worker-vm.sh
# Every value below can be overridden from the environment. The VM is created stopped unless
# START=1. Nothing is deleted: the script refuses if the VMID, name or LAN address is taken.
#
# Disks: the HP has a 128 GB NVMe (local-lvm, ~71 GB free) and a 500 GB HDD (`data`), so the
# system disk (OS, repo, node_modules, Chrome, whisper) goes on the SSD and WORK_ROOT gets its own
# disk on the HDD. Mounting that disk inside the VM is printed at the end.
set -euo pipefail

VMID="${VMID:-223}"
VM_NAME="${VM_NAME:-hp-400-g7}"
VM_IP="${VM_IP:-192.168.1.223}"
VM_PREFIX="${VM_PREFIX:-24}"
GATEWAY="${GATEWAY:-192.168.1.1}"
NAMESERVER="${NAMESERVER:-192.168.1.1}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-12}"
MEMORY_MIB="${MEMORY_MIB:-13312}"
OS_STORAGE="${OS_STORAGE:-local-lvm}"
OS_DISK_GB="${OS_DISK_GB:-64}"
WORK_STORAGE="${WORK_STORAGE:-data}"
WORK_DISK_GB="${WORK_DISK_GB:-250}"
CI_USER="${CI_USER:-aivideo}"
SSH_PUBKEY_FILE="${SSH_PUBKEY_FILE:-}"
START="${START:-0}"

IMAGE_URL_BASE="https://cloud-images.ubuntu.com/noble/current"
IMAGE_NAME="noble-server-cloudimg-amd64.img"
IMAGE_DIR="${IMAGE_DIR:-/var/lib/vz/template/cache}"
IMAGE_PATH="$IMAGE_DIR/$IMAGE_NAME"

die() { echo "refusing: $*" >&2; exit 1; }

check_prerequisites() {
  [ "$(id -u)" -eq 0 ] || die "run as root on the Proxmox node"
  command -v qm >/dev/null || die "qm not found (not a Proxmox node?)"
  [ -n "$SSH_PUBKEY_FILE" ] || die "set SSH_PUBKEY_FILE to the public key(s) allowed to log in as $CI_USER"
  [ -r "$SSH_PUBKEY_FILE" ] || die "cannot read $SSH_PUBKEY_FILE"
  grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2-)' "$SSH_PUBKEY_FILE" || die "$SSH_PUBKEY_FILE holds no public key"
}

check_vm_is_new() {
  local resources
  resources="$(pvesh get /cluster/resources --type vm --output-format json)"
  python3 - "$VMID" "$VM_NAME" "$resources" <<'EOF' || exit 1
import json, sys
vmid, name, data = int(sys.argv[1]), sys.argv[2], json.loads(sys.argv[3])
for guest in data:
    if guest.get("vmid") == vmid:
        sys.exit(f"refusing: VMID {vmid} already exists on node {guest.get('node')}")
    if guest.get("name") == name:
        sys.exit(f"refusing: a guest named {name} already exists (VMID {guest.get('vmid')})")
EOF
  if ping -c 2 -W 1 "$VM_IP" >/dev/null 2>&1; then
    die "$VM_IP answers ping; pick a free LAN address (VM_IP=...)"
  fi
}

check_storage() {
  local storage="$1" need_gb="$2" avail_kib
  avail_kib="$(pvesm status --storage "$storage" 2>/dev/null | awk 'NR == 2 { print $6 }')"
  [ -n "$avail_kib" ] || die "storage $storage not found or inactive"
  [ "$avail_kib" -gt $((need_gb * 1024 * 1024)) ] || die "storage $storage has less than ${need_gb} GB free"
}

fetch_image() {
  mkdir -p "$IMAGE_DIR"
  if [ ! -f "$IMAGE_PATH" ]; then
    echo "downloading $IMAGE_NAME"
    curl -fL --retry 3 -o "$IMAGE_PATH.part" "$IMAGE_URL_BASE/$IMAGE_NAME"
    mv "$IMAGE_PATH.part" "$IMAGE_PATH"
  fi
  echo "verifying checksum"
  local expected
  expected="$(curl -fsSL "$IMAGE_URL_BASE/SHA256SUMS" | awk -v f="*$IMAGE_NAME" '$2 == f { print $1 }')"
  [ -n "$expected" ] || die "no checksum for $IMAGE_NAME in SHA256SUMS"
  echo "$expected  $IMAGE_PATH" | sha256sum -c - \
    || die "checksum mismatch: inspect $IMAGE_PATH (a newer image may have been published; move it aside and rerun)"
}

create_vm() {
  echo "creating VM $VMID ($VM_NAME)"
  qm create "$VMID" \
    --name "$VM_NAME" \
    --ostype l26 \
    --machine q35 \
    --cpu host \
    --sockets 1 --cores "$CORES" \
    --memory "$MEMORY_MIB" --balloon 0 \
    --net0 "virtio,bridge=$BRIDGE" \
    --scsihw virtio-scsi-single \
    --scsi0 "$OS_STORAGE:0,import-from=$IMAGE_PATH,iothread=1,discard=on,ssd=1" \
    --scsi1 "$WORK_STORAGE:$WORK_DISK_GB,iothread=1" \
    --ide2 "$OS_STORAGE:cloudinit" \
    --boot order=scsi0 \
    --serial0 socket --vga serial0 \
    --agent enabled=1 \
    --onboot 1 \
    --ciuser "$CI_USER" \
    --sshkeys "$SSH_PUBKEY_FILE" \
    --ipconfig0 "ip=$VM_IP/$VM_PREFIX,gw=$GATEWAY" \
    --nameserver "$NAMESERVER" \
    --ciupgrade 1
  qm resize "$VMID" scsi0 "${OS_DISK_GB}G"
}

print_next_steps() {
  cat <<EOF

VM $VMID ($VM_NAME) created: $CORES vCPU (host), ${MEMORY_MIB} MiB RAM, ballooning off,
system disk ${OS_DISK_GB}G on $OS_STORAGE, work disk ${WORK_DISK_GB}G on $WORK_STORAGE, $VM_IP on $BRIDGE.

Next:
  qm start $VMID            # first boot runs cloud-init and apt upgrade; console: qm terminal $VMID
  ssh $CI_USER@$VM_IP

Inside the VM (once), then continue with ops/linux-worker.md §1 step 3:
  sudo apt install -y qemu-guest-agent && sudo systemctl start qemu-guest-agent
  DISK=/dev/disk/by-id/scsi-0QEMU_QEMU_HARDDISK_drive-scsi1
  sudo mkfs.ext4 -L aivideo-work "\$DISK"
  mkdir -p ~/aivideo/work
  echo 'LABEL=aivideo-work /home/$CI_USER/aivideo/work ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
  sudo systemctl daemon-reload && sudo mount ~/aivideo/work && sudo chown $CI_USER: ~/aivideo/work
EOF
}

main() {
  check_prerequisites
  check_vm_is_new
  check_storage "$OS_STORAGE" "$OS_DISK_GB"
  check_storage "$WORK_STORAGE" "$WORK_DISK_GB"
  fetch_image
  create_vm
  if [ "$START" = "1" ]; then
    qm start "$VMID"
  fi
  print_next_steps
}

main "$@"
