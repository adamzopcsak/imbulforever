# imbulforever.yagi.hu

A page listing World of Warcraft: Forever characters, served at https://imbulforever.yagi.hu, with an admin page at `/admin/` for adding, editing and deleting characters.

## How it works

- **Static pages:** `index.html` (public list) and `admin/index.html` (add form), with `shared.js`, `app.js`, `admin/admin.js` and `style.css`.
- **`icons/`:** class and race icons (from the Wowhead image CDN, `wow.zamimg.com`). Race icons exist per gender: `icons/race/{race}_{male|female}.jpg`; profession icons are `icons/profession/{profession}.jpg` and faction icons `icons/faction/{alliance|horde}.jpg`.
- **`game-data.json`:** classes (English name and class color), races, genders, factions, roles, primary professions (at most `maxPrimaryProfessions` per character) and the max level. Both the pages and the API use it, so a new race or class is added here plus its icon(s) in `icons/`.
- **`blizzard.py`:** background sync from the Blizzard Battle.net API. Every minute it fetches each character as `/profile/wow/character/{name}-{surname}` in the `profile-forever-eu` namespace (WoW: Forever has no realms) and, if found, overwrites level, class, race, gender, faction, ruleset and (every 15 minutes) primary professions, and stores `lastLogin`. The owner ("Kié") stays manual. A 404 changes nothing. Runs only if `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` are set; on the server they live in `/etc/imbulforever/bnet.env`, written by `deploy/set-bnet-credentials.sh`:

  ```sh
  ssh -t -i ~/.ssh/yagismot_deploy root@138.199.196.51 /opt/imbulforever/set-bnet-credentials.sh
  ```

- **`server.py`:** a small API (Python standard library only):
  - `GET /api/characters`: the public list
  - `GET /api/status`: time of the last Blizzard sync (`lastSync`)
  - `POST /admin/api/characters`: adds a character (validated; duplicate full names are rejected)
  - `PUT /admin/api/characters/{id}`: updates a character (same validation)
  - `DELETE /admin/api/characters/{id}`: deletes a character
- **Data:** characters are stored in one JSON file (`/var/lib/imbulforever/characters.json` on the server). On first start it is seeded from `characters.json` in the repo; after that, deploys never overwrite it.
- **Access control:** Caddy protects `/admin*` (the admin page and the write API) with basic auth. The API itself only listens on `127.0.0.1`.

## Local preview

```sh
python server.py --port 5517 --static .
```

Then open http://localhost:5517 and http://localhost:5517/admin/. Locally there is no password, and data goes to `data/characters.json` (git-ignored).

## Deploy

One-time server setup (already done on the VPS): the `imbulforever.yagi.hu` block in `/etc/caddy/Caddyfile` is `deploy/Caddyfile.example`. It imports the admin credentials from `/etc/caddy/imbulforever-admin.caddy` (owned by `root:caddy`, mode 640). Note that the server runs Caddy 2.6, where the directive is `basicauth`, not `basic_auth`.

To set or change the admin user name and password (interactive, run from your machine):

```sh
ssh -t -i ~/.ssh/yagismot_deploy root@138.199.196.51 /opt/imbulforever/set-admin-password.sh
```

Only the bcrypt hash of the password is stored. Until a password is set, the file holds the hash of a random password, so `/admin` is locked for everyone.

After that, every deploy is:

```sh
./deploy.sh
```

It writes `version.json` (the version from `VERSION` and the deploy time in UTC, shown in the page footer in Budapest time), copies the static files to `/var/www/imbulforever.yagi.hu`, the API to `/opt/imbulforever`, installs `deploy/imbulforever.service` and restarts it.

## Versioning

The current version is in `VERSION` (semantic versioning). Bump it in the pull request of a change; the release time is set automatically when `./deploy.sh` runs.
