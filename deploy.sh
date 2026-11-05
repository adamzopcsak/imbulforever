#!/bin/sh
# Upload the static site to the VPS; Caddy serves /var/www/imbulforever.yagi.hu for imbulforever.yagi.hu.
set -e

KEY="${KEY:-$HOME/.ssh/yagismot_deploy}"
HOST="${HOST:-root@138.199.196.51}"
DIR=/var/www/imbulforever.yagi.hu

cd "$(dirname "$0")"
ssh -i "$KEY" "$HOST" "mkdir -p $DIR"
scp -i "$KEY" index.html style.css app.js characters.json favicon.svg "$HOST:$DIR/"
ssh -i "$KEY" "$HOST" "chmod -R a+rX $DIR"
echo "Deployed to https://imbulforever.yagi.hu"
