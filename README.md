# imbulforever.yagi.hu

A page listing World of Warcraft: Forever characters, served at https://imbulforever.yagi.hu, with an admin page at `/admin/` for adding, editing and deleting characters.

## How it works

- **Static pages:** `index.html` (public list), `magyaritas/index.html` ("Magyarítás": how to install the Hungarian translation and voice-over addons; the header links "Lista oldal" and "Magyarítás" switch between it and the list), `karakter/index.html` (character page, `/karakter/?id=<id>`, opened by clicking a name; shows the details and the equipped gear) and `admin/index.html` (add/edit form), with `shared.js`, `app.js`, `karakter/karakter.js`, `admin/admin.js` and `style.css`.
- **`icons/`:** class and race icons (from the Wowhead image CDN, `wow.zamimg.com`). Race icons exist per gender: `icons/race/{race}_{male|female}.jpg`; profession icons are `icons/profession/{profession}.jpg` and faction icons `icons/faction/{alliance|horde}.jpg`.
- **`i18n.js`:** the English version of the public pages (Hungarian is the default); the switch is in the header, the admin area is Hungarian only. New user-facing text goes through `t()` or `data-i18n`, with its English text added here.
- **`game-data.json`:** classes (English name and class color), races, genders, factions, roles, primary professions (at most `maxPrimaryProfessions` per character) and the max level. Both the pages and the API use it, so a new race or class is added here plus its icon(s) in `icons/`.
- **`blizzard.py`:** background sync from the Blizzard Battle.net API. Every minute it fetches each character as `/profile/wow/character/{name}-{surname}` in the `profile-forever-eu` namespace (WoW: Forever has no realms) and, if found, overwrites level, class, race, gender, faction, ruleset and (every 15 minutes) primary professions, and stores `lastLogin`, `guild` (shown as `<Guild>` under the name) and, every 5 minutes, `equipment` (slot, name, quality, item level, type and the icon URL from Blizzard's render CDN; icon URLs are cached in `item-icons.json` next to the data file). The owner ("Kié") stays manual. A 404 changes nothing. Runs only if `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` are set; on the server they live in `/etc/imbulforever/bnet.env`, written by `deploy/set-bnet-credentials.sh`:

  ```sh
  ssh -t -i ~/.ssh/yagismot_deploy root@138.199.196.51 /opt/imbulforever/set-bnet-credentials.sh
  ```

- **`server.py`:** a small API (Python standard library only):
  - `GET /api/characters`: the public list
  - `GET /api/status`: time of the last Blizzard sync (`lastSync`)
  - `GET /api/tips`, `POST /admin/api/tips`, `DELETE /admin/api/tips/{id}`: the tips pool. The homepage shows one tip under the list; at every full hour the server moves on to the next tip in list order (wrapping around; the same for everyone). The admin page adds tips (to the end) and deletes them, with a countdown to the next change. Stored in `tips.json` (seeded with the first tip) and `tips-rotation.json` next to the data file.
  - `POST /admin/api/characters`: adds a character (validated; duplicate full names are rejected)
  - `PUT /admin/api/characters/{id}`: updates a character (same validation)
  - `DELETE /admin/api/characters/{id}`: deletes a character
- **Data:** characters are stored in one JSON file (`/var/lib/imbulforever/characters.json` on the server). On first start it is seeded from `characters.json` in the repo; after that, deploys never overwrite it.
- **Sorting:** highest level first; within a level, whoever reached it first (`levelReachedAt`, recorded when the level changes through the admin page or the Blizzard sync; characters without it count as earliest), then by name.
- **Themes (`themes.js`):** dark is the default, light is a button in the header; the choice is kept in `localStorage`. Seasonal themes (`SEASONS`; now Christmas, December 24–30) are the default in their season, with a three-way switch; leaving one is remembered for that season of that year only. The admin page lists the seasonal themes and when they are on. `?tema=christmas` turns a seasonal theme on in the browser tab for trying it out, `?tema=off` ends that.
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
