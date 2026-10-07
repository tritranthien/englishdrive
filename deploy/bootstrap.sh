#!/usr/bin/env bash
# Run as root on Ubuntu 22.04+ after configuring SSH access to GitHub.
set -Eeuo pipefail
umask 077
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version
install -d -m 0700 /opt/englishdrive
if [[ ! -d /opt/englishdrive/repo.git ]]; then
  GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes' \
    git clone --bare git@github.com:tritranthien/englishdrive.git /opt/englishdrive/repo.git
fi
if [[ ! -f /etc/englishdrive.env ]]; then
  printf 'POSTGRES_PASSWORD=%s\nJWT_SECRET=%s\nAPI_BIND_ADDRESS=127.0.0.1\n' \
    "$(openssl rand -hex 32)" "$(openssl rand -hex 48)" > /etc/englishdrive.env
fi
chmod 600 /etc/englishdrive.env
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
install -m 0755 "$script_dir/deploy.sh" /usr/local/sbin/englishdrive-deploy
install -m 0644 "$script_dir/englishdrive-deploy.service" /etc/systemd/system/
install -m 0644 "$script_dir/englishdrive-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
echo 'Bootstrap ready. Configure /etc/englishdrive.env, run the service, then enable the timer.'
