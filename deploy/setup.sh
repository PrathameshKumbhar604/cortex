#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (AWS Lightsail). Run as the default `ubuntu` user:
#   curl -fsSL https://raw.githubusercontent.com/<you>/cortex/main/deploy/setup.sh | bash
set -euo pipefail

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

# 2 GB of swap: the speech model and the two apps can briefly exceed a small plan's RAM.
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

sudo mkdir -p /opt/cortex/data /opt/cortex/memory-data /opt/cortex/wallet
sudo chown -R "$USER":"$USER" /opt/cortex
sudo chown 1000:1000 /opt/cortex/data # the web container runs as the `node` user (uid 1000)
touch /opt/cortex/.env && chmod 600 /opt/cortex/.env

echo "Done. Put your secrets in /opt/cortex/.env (see deploy/README.md), then log out and back in."
