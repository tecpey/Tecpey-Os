#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y curl unzip git nginx ufw fail2ban ca-certificates gnupg
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
sudo npm i -g pm2
sudo systemctl enable --now nginx
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
node -v
npm -v
