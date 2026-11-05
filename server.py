"""Small JSON API for the character list (Python standard library only).

Endpoints:
  GET  /api/characters        public list of characters
  GET  /api/status            time of the last Blizzard sync
  POST /admin/api/characters       add a character (protected by Caddy basic auth in production)
  PUT  /admin/api/characters/<id>  update a character (protected the same way)
  DELETE /admin/api/characters/<id>  delete a character (protected the same way)
  GET  /api/tips                   the tips, the one shown now and when the next one comes (every hour)
  POST /admin/api/tips             add a tip; DELETE /admin/api/tips/<id> deletes one

In production Caddy serves the static files and proxies /api/* and /admin/api/* here.
For local development, pass --static to also serve the site from a folder.

If BNET_CLIENT_ID and BNET_CLIENT_SECRET are set, a background thread syncs the characters
from the Blizzard Battle.net API every minute (see blizzard.py).
"""

import argparse
import json
import os
import shutil
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import blizzard

APP_DIR = Path(__file__).resolve().parent
MAX_BODY_BYTES = 10_000
MAX_NAME_LENGTH = 24
MAX_OWNER_LENGTH = 40
MAX_TIP_LENGTH = 300
FIRST_TIP = "Tudtad? Ha rákattintasz egy karakter nevére, megnézheted a gearjét."

# Fields written by the Blizzard sync, kept when the admin saves a character.
SYNC_ONLY_FIELDS = ("lastLogin", "blizzard", "guild", "equipment", "refreshedAt")
# Old roleset values -> current ones.
ROLE_MIGRATIONS = {"pve": "normal"}


def utc_now() -> str:
    """Current time as an ISO 8601 UTC string, e.g. 2026-11-05T13:36:00Z."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


GAME_DATA = json.loads((APP_DIR / "game-data.json").read_text(encoding="utf-8"))


class CharacterStore:
    """Characters kept in one JSON file, written atomically."""

    def __init__(self, path: Path, seed: Path | None):
        self.path = path
        self.lock = threading.Lock()
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            if seed and seed.exists():
                shutil.copyfile(seed, path)
            else:
                path.write_text("[]\n", encoding="utf-8")
        with self.lock:
            characters = self._read()
            changed = False
            for c in characters:
                if "id" not in c:
                    c["id"] = uuid.uuid4().hex
                    changed = True
                if c.get("role") in ROLE_MIGRATIONS:
                    c["role"] = ROLE_MIGRATIONS[c["role"]]
                    changed = True
            if changed:
                self._write(characters)

    def _read(self) -> list:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, characters: list) -> None:
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(characters, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, self.path)

    def list(self) -> list:
        with self.lock:
            return self._read()

    @staticmethod
    def _check_unique_name(characters: list, character: dict, ignore_id: str | None = None) -> None:
        full_name = f"{character['name']} {character['surname']}".casefold()
        for c in characters:
            if c.get("id") != ignore_id and f"{c['name']} {c['surname']}".casefold() == full_name:
                raise ValueError("Ilyen nevű karakter már van a listán.")

    def add(self, character: dict) -> dict:
        with self.lock:
            characters = self._read()
            self._check_unique_name(characters, character)
            now = utc_now()
            character = {"id": uuid.uuid4().hex, **character, "updatedAt": now, "levelReachedAt": now}
            characters.append(character)
            self._write(characters)
            return character

    def update(self, character_id: str, character: dict) -> dict | None:
        """Replace the character's fields; returns None if there is no character with this id."""
        with self.lock:
            characters = self._read()
            index = next((i for i, c in enumerate(characters) if c.get("id") == character_id), None)
            if index is None:
                return None
            self._check_unique_name(characters, character, ignore_id=character_id)
            old = characters[index]
            # Only a real change counts as an update; saving the same data keeps the old time.
            changed = any(old.get(key) != value for key, value in character.items())
            updated_at = utc_now() if changed else old.get("updatedAt")
            sync_fields = {key: old[key] for key in SYNC_ONLY_FIELDS if key in old}
            characters[index] = {"id": character_id, **character, **sync_fields}
            # When the character reached its current level; used to order characters of the same level.
            level_reached = utc_now() if old.get("level") != character["level"] else old.get("levelReachedAt")
            if level_reached:
                characters[index]["levelReachedAt"] = level_reached
            if updated_at:
                characters[index]["updatedAt"] = updated_at
            self._write(characters)
            return characters[index]

    def apply_sync(self, updates: dict) -> None:
        """Merge Blizzard data ({character id: fields}) into the stored characters; writes only on a change."""
        with self.lock:
            characters = self._read()
            changed = False
            for c in characters:
                fields = updates.get(c.get("id"))
                if not fields:
                    continue  # deleted meanwhile, or nothing from Blizzard
                game_changed = any(c.get(k) != v for k, v in fields.items() if k not in SYNC_ONLY_FIELDS)
                if "level" in fields and c.get("level") != fields["level"]:
                    c["levelReachedAt"] = utc_now()
                # Blizzard saves a profile when the character logs out, with the login time of that session:
                # a new lastLogin means the character has just logged out and its data is fresh now. The first
                # time a character is seen, the best guess is its last login.
                if "lastLogin" in fields:
                    if c.get("lastLogin") and c["lastLogin"] != fields["lastLogin"]:
                        c["refreshedAt"] = utc_now()
                        changed = True
                    elif not c.get("refreshedAt"):
                        c["refreshedAt"] = fields["lastLogin"]
                        changed = True
                if any(c.get(k) != v for k, v in fields.items()):
                    c.update(fields)
                    changed = True
                if game_changed:
                    c["updatedAt"] = utc_now()
            if changed:
                self._write(characters)

    def delete(self, character_id: str) -> bool:
        """Remove the character; returns False if there is no character with this id."""
        with self.lock:
            characters = self._read()
            remaining = [c for c in characters if c.get("id") != character_id]
            if len(remaining) == len(characters):
                return False
            self._write(remaining)
            return True


class TipStore:
    """The tips shown under the character list, in the order they were added, and which one is shown now.

    The shown tip moves on to the next one in the list at every full hour (the same for every visitor),
    and wraps around at the end. Deleting the shown tip moves on to the one after it; adding a tip puts it
    at the end of the list without changing the shown one. The rotation is kept in a second file.
    """

    def __init__(self, path: Path):
        self.path = path
        self.state_path = path.with_name(path.stem + "-rotation.json")
        self.lock = threading.Lock()
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            self._write_json(path, [{"id": uuid.uuid4().hex, "text": FIRST_TIP, "createdAt": utc_now()}])

    def _read(self) -> list:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _read_state(self) -> dict:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _write_json(self, path: Path, value) -> None:
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)

    @staticmethod
    def _hour_start(now: datetime) -> datetime:
        return now.replace(minute=0, second=0, microsecond=0)

    def _current(self, tips: list) -> dict:
        """Advance the rotation to now and return {currentId, nextChangeAt}; writes the state if it moved."""
        hour = self._hour_start(datetime.now(timezone.utc))
        state = self._read_state()
        ids = [tip["id"] for tip in tips]
        changed = False
        if not ids:
            current = None
        elif state.get("currentId") in ids and state.get("since"):
            since = datetime.fromisoformat(state["since"].replace("Z", "+00:00"))
            steps = max(0, int((hour - since).total_seconds() // 3600))
            current = ids[(ids.index(state["currentId"]) + steps) % len(ids)]
            changed = steps > 0
        else:
            current = ids[0]
            changed = True
        if changed:
            self._write_json(self.state_path, {"currentId": current, "since": hour.strftime("%Y-%m-%dT%H:%M:%SZ")})
        next_change = hour.replace(tzinfo=timezone.utc).timestamp() + 3600
        return {"currentId": current,
                "nextChangeAt": datetime.fromtimestamp(next_change, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}

    def snapshot(self) -> dict:
        """{tips, currentId, nextChangeAt} for the API."""
        with self.lock:
            tips = self._read()
            return {"tips": tips, **self._current(tips)}

    def add(self, text: str, text_en: str = "") -> dict:
        with self.lock:
            tips = self._read()
            self._current(tips)  # settle the rotation before the list changes
            tip = {"id": uuid.uuid4().hex, "text": text, "createdAt": utc_now()}
            if text_en:
                tip["textEn"] = text_en
            tips.append(tip)
            self._write_json(self.path, tips)
            return tip

    def delete(self, tip_id: str) -> bool:
        with self.lock:
            tips = self._read()
            ids = [tip["id"] for tip in tips]
            if tip_id not in ids:
                return False
            current = self._current(tips)["currentId"]
            index = ids.index(tip_id)
            remaining = tips[:index] + tips[index + 1:]
            self._write_json(self.path, remaining)
            if current == tip_id and remaining:
                # The shown tip was deleted: show the one that came after it, for the rest of this hour.
                successor = remaining[index % len(remaining)]["id"]
                since = self._hour_start(datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
                self._write_json(self.state_path, {"currentId": successor, "since": since})
            return True


def validate_tip(data: object) -> tuple[str, str]:
    """The Hungarian tip text and the optional English one ("" if not given), trimmed.

    Raises ValueError with a Hungarian message for the UI.
    """
    text = data.get("text") if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise ValueError("A tipp szövege nem lehet üres.")
    text = " ".join(text.split())
    text_en = data.get("textEn") or ""
    if not isinstance(text_en, str):
        raise ValueError("Az angol szöveg hibás.")
    text_en = " ".join(text_en.split())
    if len(text) > MAX_TIP_LENGTH or len(text_en) > MAX_TIP_LENGTH:
        raise ValueError(f"A tipp legfeljebb {MAX_TIP_LENGTH} karakter lehet.")
    return text, text_en


def validate_character(data: object) -> dict:
    """Return a clean character dict, or raise ValueError with a Hungarian message for the UI."""
    if not isinstance(data, dict):
        raise ValueError("Hibás kérés.")

    def name_field(key: str, label: str) -> str:
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"A(z) {label} megadása kötelező.")
        value = value.strip()
        if len(value) > MAX_NAME_LENGTH:
            raise ValueError(f"A(z) {label} legfeljebb {MAX_NAME_LENGTH} karakter lehet.")
        return value

    def choice(key: str, label: str, options: dict) -> str:
        value = data.get(key)
        if value not in options:
            raise ValueError(f"Ismeretlen {label}.")
        return value

    level = data.get("level")
    if isinstance(level, str) and level.strip().isdigit():
        level = int(level)
    if not isinstance(level, int) or isinstance(level, bool) or not 1 <= level <= GAME_DATA["maxLevel"]:
        raise ValueError(f"A szint 1 és {GAME_DATA['maxLevel']} közötti szám lehet.")

    professions = data.get("professions", [])
    if not isinstance(professions, list) or any(p not in GAME_DATA["professions"] for p in professions):
        raise ValueError("Ismeretlen szakma.")
    # Keep the game-data order and drop duplicates.
    professions = [p for p in GAME_DATA["professions"] if p in professions]
    primary = [p for p in professions if GAME_DATA["professions"][p]["type"] == "primary"]
    if len(primary) > GAME_DATA["maxPrimaryProfessions"]:
        raise ValueError(f"Legfeljebb {GAME_DATA['maxPrimaryProfessions']} fő szakma választható.")

    # The roleset is optional: an empty string means "not set".
    role = data.get("role") or ""
    if role and role not in GAME_DATA["roles"]:
        raise ValueError("Ismeretlen játékmód.")

    owner = data.get("owner", "")
    if not isinstance(owner, str):
        raise ValueError("Hibás kérés.")
    owner = " ".join(owner.split())  # trim and collapse whitespace
    if len(owner) > MAX_OWNER_LENGTH:
        raise ValueError(f"A „Kié” mező legfeljebb {MAX_OWNER_LENGTH} karakter lehet.")

    return {
        "name": name_field("name", "név"),
        "surname": name_field("surname", "vezetéknév"),
        "owner": owner,
        "class": choice("class", "kaszt", GAME_DATA["classes"]),
        "level": level,
        "role": role,
        "race": choice("race", "faj", GAME_DATA["races"]),
        "gender": choice("gender", "nem", GAME_DATA["genders"]),
        "faction": choice("faction", "frakció", GAME_DATA["factions"]),
        "professions": professions,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, store: CharacterStore, tips: TipStore, sync, static_dir: str | None, **kwargs):
        self.store = store
        self.tips = tips
        self.sync = sync
        self.static_dir = static_dir
        super().__init__(*args, directory=static_dir or str(APP_DIR), **kwargs)

    def end_headers(self):
        # Static files (local development): let the browser cache them, but always check for a newer version,
        # so a changed script is never mixed with a newer page. Caddy does the same in production.
        if self.static_dir and "Cache-Control" not in "".join(map(str, getattr(self, "_headers_buffer", []))):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, status: HTTPStatus, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/characters":
            self.send_json(HTTPStatus.OK, self.store.list())
        elif path == "/api/tips":
            self.send_json(HTTPStatus.OK, self.tips.snapshot())
        elif path == "/api/status":
            self.send_json(HTTPStatus.OK, {"lastSync": self.sync.last_sync if self.sync else None})
        elif self.static_dir and not path.startswith(("/api/", "/admin/api/")):
            super().do_GET()
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nem található."})

    def do_HEAD(self):
        if self.static_dir:
            super().do_HEAD()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def read_character(self) -> dict | None:
        """Read and validate the JSON body; sends a 400 and returns None if it is invalid."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY_BYTES:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Hibás kérés."})
            return None
        try:
            return validate_character(json.loads(self.rfile.read(length)))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Hibás kérés."})
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        return None

    def read_json_body(self) -> object:
        """The parsed JSON body; sends a 400 and returns None if it is missing or invalid."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY_BYTES:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Hibás kérés."})
            return None
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Hibás kérés."})
            return None

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/admin/api/tips":
            data = self.read_json_body()
            if data is None:
                return
            try:
                text, text_en = validate_tip(data)
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return
            self.send_json(HTTPStatus.CREATED, self.tips.add(text, text_en))
            return
        if path != "/admin/api/characters":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nem található."})
            return
        character = self.read_character()
        if character is None:
            return
        try:
            created = self.store.add(character)
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        else:
            self.send_json(HTTPStatus.CREATED, created)

    def character_id_from_path(self, prefix: str = "/admin/api/characters/") -> str | None:
        """The id in <prefix><id>; sends a 404 and returns None if the path does not match."""
        path = self.path.split("?", 1)[0]
        character_id = path[len(prefix):] if path.startswith(prefix) else ""
        if not character_id or "/" in character_id:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nem található."})
            return None
        return character_id

    def do_DELETE(self):
        if self.path.startswith("/admin/api/tips/"):
            tip_id = self.character_id_from_path("/admin/api/tips/")
            if tip_id is None:
                return
            if self.tips.delete(tip_id):
                self.send_json(HTTPStatus.OK, {"deleted": tip_id})
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ez a tipp már nincs meg."})
            return
        character_id = self.character_id_from_path()
        if character_id is None:
            return
        if self.store.delete(character_id):
            self.send_json(HTTPStatus.OK, {"deleted": character_id})
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ez a karakter már nincs a listán."})

    def do_PUT(self):
        character_id = self.character_id_from_path()
        if character_id is None:
            return
        character = self.read_character()
        if character is None:
            return
        try:
            updated = self.store.update(character_id, character)
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        if updated is None:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ez a karakter már nincs a listán."})
        else:
            self.send_json(HTTPStatus.OK, updated)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--data", type=Path, default=APP_DIR / "data" / "characters.json",
                        help="JSON file the characters are stored in")
    parser.add_argument("--seed", type=Path, default=APP_DIR / "characters.json",
                        help="initial characters, copied to --data if it does not exist yet")
    parser.add_argument("--static", help="also serve static files from this folder (local development)")
    args = parser.parse_args()

    store = CharacterStore(args.data, args.seed)
    tips = TipStore(args.data.parent / "tips.json")

    sync = None
    client_id, client_secret = os.environ.get("BNET_CLIENT_ID"), os.environ.get("BNET_CLIENT_SECRET")
    if client_id and client_secret:
        client = blizzard.BlizzardClient(client_id, client_secret, os.environ.get("BNET_REGION", "eu"))
        sync = blizzard.BlizzardSync(store, client, GAME_DATA, args.data.parent / "item-icons.json")
        sync.start()
        print("Blizzard sync started", flush=True)
    else:
        print("BNET_CLIENT_ID / BNET_CLIENT_SECRET not set: Blizzard sync is off", flush=True)

    static_dir = str(Path(args.static).resolve()) if args.static else None
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, store=store, tips=tips, sync=sync, static_dir=static_dir))
    print(f"Listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
