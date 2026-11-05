#!/bin/sh
# Deploy to the VPS:
#   - static files to /var/www/imbulforever.yagi.hu (served by Caddy)
#   - the API to /opt/imbulforever, run by the imbulforever systemd service
# Characters live in /var/lib/imbulforever/characters.json and are never overwritten by a deploy.
# The Caddy site block (deploy/Caddyfile.example) is set up by hand once; the admin password is set with deploy/set-admin-password.sh.
set -e

KEY="${KEY:-$HOME/.ssh/yagismot_deploy}"
HOST="${HOST:-root@138.199.196.51}"
WEB=/var/www/imbulforever.yagi.hu
APP=/opt/imbulforever

cd "$(dirname "$0")"

# version.json is shown in the page footer: the version from VERSION and the release (deploy) time in UTC.
VERSION=$(tr -d '[:space:]' < VERSION)
printf '{"version": "%s", "released": "%s"}\n' "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > version.json

ssh -i "$KEY" "$HOST" "mkdir -p $WEB/admin $WEB/karakter $APP"
scp -i "$KEY" index.html style.css themes.js shared.js app.js game-data.json favicon.svg version.json "$HOST:$WEB/"
scp -i "$KEY" admin/index.html admin/admin.js admin/seasons.js "$HOST:$WEB/admin/"
scp -i "$KEY" karakter/index.html karakter/karakter.js "$HOST:$WEB/karakter/"
scp -i "$KEY" -r icons "$HOST:$WEB/"
scp -i "$KEY" server.py blizzard.py game-data.json characters.json deploy/set-admin-password.sh deploy/set-bnet-credentials.sh "$HOST:$APP/"
scp -i "$KEY" deploy/imbulforever.service "$HOST:/etc/systemd/system/imbulforever.service"
ssh -i "$KEY" "$HOST" "chmod -R a+rX $WEB $APP && chmod 700 $APP/set-admin-password.sh $APP/set-bnet-credentials.sh && systemctl daemon-reload && systemctl enable --quiet imbulforever && systemctl restart imbulforever && systemctl is-active imbulforever"
echo "Deployed version $VERSION to https://imbulforever.yagi.hu"
