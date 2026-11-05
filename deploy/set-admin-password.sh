#!/bin/sh
# Set the admin user name and password for imbulforever.yagi.hu/admin.
# Run on the server as root (interactive):
#   ssh -t root@138.199.196.51 /opt/imbulforever/set-admin-password.sh
# The password is typed into `caddy hash-password` and only its bcrypt hash is stored.
set -e

AUTH_FILE=/etc/caddy/imbulforever-admin.caddy

printf "Admin user name: "
read -r user
case "$user" in
	""|*[!A-Za-z0-9._-]*) echo "Use letters, digits, dot, dash or underscore only." >&2; exit 1 ;;
esac

# caddy hash-password prints its own prompts to stdout, which is captured here,
# so print instructions on stderr and keep only the last line (the hash).
echo "Type the password, press Enter, then type it again and press Enter (nothing is shown while typing):" >&2
hash=$(caddy hash-password | tail -n 1)
case "$hash" in
	'$2a$'*) ;;
	*) echo "Could not create the password hash (did the two passwords match?)." >&2; exit 1 ;;
esac

tmp=$(mktemp)
# Caddy 2.6 calls the directive "basicauth" (renamed to basic_auth in 2.8).
printf 'basicauth /admin* {\n\t%s %s\n}\n' "$user" "$hash" > "$tmp"
chown root:caddy "$tmp"
chmod 640 "$tmp"
mv "$tmp" "$AUTH_FILE"

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1
systemctl reload caddy
echo "Admin password set for user '$user'."
