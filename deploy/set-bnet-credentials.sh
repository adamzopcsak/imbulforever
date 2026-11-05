#!/bin/sh
# Store the Blizzard Battle.net API client for the character sync and restart the API.
# Run on the server as root (interactive):
#   ssh -t root@138.199.196.51 /opt/imbulforever/set-bnet-credentials.sh
# Values are written to /etc/imbulforever/bnet.env (root only), which the systemd service reads.
set -e

ENV_FILE=/etc/imbulforever/bnet.env

printf "Battle.net Client ID: "
read -r client_id
printf "Battle.net Client Secret (not shown): "
stty -echo
read -r client_secret
stty echo
echo

if [ -z "$client_id" ] || [ -z "$client_secret" ]; then
	echo "Both values are required." >&2
	exit 1
fi

mkdir -p "$(dirname "$ENV_FILE")"
umask 077
printf 'BNET_CLIENT_ID=%s\nBNET_CLIENT_SECRET=%s\n' "$client_id" "$client_secret" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

systemctl restart imbulforever
sleep 3
if journalctl -u imbulforever -n 20 --no-pager | grep -q "Blizzard sync started"; then
	echo "Saved. The Blizzard sync is running."
else
	echo "Saved, but the sync did not report a start; check: journalctl -u imbulforever -n 50" >&2
fi
