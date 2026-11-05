# imbulforever.yagi.hu

A page listing World of Warcraft: Forever characters, served at https://imbulforever.yagi.hu, with an admin page at `/admin/` for adding characters.

## How it works

- **Static pages:** `index.html` (public list) and `admin/index.html` (add form), with `shared.js`, `app.js`, `admin/admin.js` and `style.css`.
- **`game-data.json`:** classes (Hungarian label and class color), races, roles and the max level. Both the pages and the API use it, so new races or classes only need to be added here.
- **`server.py`:** a small API (Python standard library only):
  - `GET /api/characters`: the public list
  - `POST /admin/api/characters`: adds a character (validated; duplicate full names are rejected)
- **Data:** characters are stored in one JSON file (`/var/lib/imbulforever/characters.json` on the server). On first start it is seeded from `characters.json` in the repo; after that, deploys never overwrite it.
- **Access control:** Caddy protects `/admin*` (the admin page and the write API) with basic auth. The API itself only listens on `127.0.0.1`.

## Local preview

```sh
python server.py --port 5517 --static .
```

Then open http://localhost:5517 and http://localhost:5517/admin/. Locally there is no password, and data goes to `data/characters.json` (git-ignored).

## Deploy

One-time server setup: replace the `imbulforever.yagi.hu` block in `/etc/caddy/Caddyfile` with `deploy/Caddyfile.example`, putting your user name and a hash from `caddy hash-password` in it, then `systemctl reload caddy`.

After that, every deploy is:

```sh
./deploy.sh
```

It copies the static files to `/var/www/imbulforever.yagi.hu`, the API to `/opt/imbulforever`, installs `deploy/imbulforever.service` and restarts it.
