#!/bin/sh
# Deploy to the VPS:
#   - static files to /var/www/imbulforever.yagi.hu (served by Caddy)
#   - the API to /opt/imbulforever, run by the imbulforever systemd service
# Characters live in /var/lib/imbulforever/characters.json and are never overwritten by a deploy.
# The Caddy site block (deploy/Caddyfile.example) is set up by hand once, because it holds the admin password hash.
set -e

KEY="${KEY:-$HOME/.ssh/yagismot_deploy}"
HOST="${HOST:-root@138.199.196.51}"
WEB=/var/www/imbulforever.yagi.hu
APP=/opt/imbulforever

cd "$(dirname "$0")"
ssh -i "$KEY" "$HOST" "mkdir -p $WEB/admin $APP"
scp -i "$KEY" index.html style.css shared.js app.js game-data.json favicon.svg "$HOST:$WEB/"
scp -i "$KEY" admin/index.html admin/admin.js "$HOST:$WEB/admin/"
scp -i "$KEY" -r icons "$HOST:$WEB/"
scp -i "$KEY" server.py game-data.json characters.json "$HOST:$APP/"
scp -i "$KEY" deploy/imbulforever.service "$HOST:/etc/systemd/system/imbulforever.service"
ssh -i "$KEY" "$HOST" "chmod -R a+rX $WEB $APP && systemctl daemon-reload && systemctl enable --quiet imbulforever && systemctl restart imbulforever && systemctl is-active imbulforever"
echo "Deployed to https://imbulforever.yagi.hu"
