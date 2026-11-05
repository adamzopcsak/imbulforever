# imbulforever.yagi.hu

A static page listing World of Warcraft: Forever characters, served at https://imbulforever.yagi.hu.

## Adding a character

Add an entry to `characters.json`:

```json
{ "name": "Yagi", "surname": "Inazum", "class": "mage", "level": 6, "role": "pvp", "race": "skyborne" }
```

- `class`: `warrior`, `paladin`, `hunter`, `rogue`, `priest`, `shaman`, `mage`, `warlock`, `druid`
- `role`: `pvp` or `pve`
- `race`: a key from `RACES` in `app.js` (unknown values are shown as-is)

The list is sorted by level (highest first), then by name.

## Local preview

```sh
python -m http.server 5517
```

Then open http://localhost:5517 (the page loads `characters.json` with `fetch`, so opening the file directly does not work).

## Deploy

```sh
./deploy.sh
```

This copies the site to `/var/www/imbulforever.yagi.hu` on the VPS. Caddy (`/etc/caddy/Caddyfile`) needs a site block for `imbulforever.yagi.hu` that serves that folder; it handles HTTPS automatically.
