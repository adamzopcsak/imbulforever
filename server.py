"""Small JSON API for the character list (Python standard library only).

Endpoints:
  GET  /api/characters        public list of characters
  POST /admin/api/characters  add a character (protected by Caddy basic auth in production)

In production Caddy serves the static files and proxies /api/* and /admin/api/* here.
For local development, pass --static to also serve the site from a folder.
"""

import argparse
import json
import os
import shutil
import tempfile
import threading
import uuid
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
MAX_BODY_BYTES = 10_000
MAX_NAME_LENGTH = 24

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
            if any("id" not in c for c in characters):
                for c in characters:
                    c.setdefault("id", uuid.uuid4().hex)
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

    def add(self, character: dict) -> dict:
        with self.lock:
            characters = self._read()
            full_name = f"{character['name']} {character['surname']}".casefold()
            if any(f"{c['name']} {c['surname']}".casefold() == full_name for c in characters):
                raise ValueError("Ilyen nevű karakter már van a listán.")
            character = {"id": uuid.uuid4().hex, **character}
            characters.append(character)
            self._write(characters)
            return character


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

    return {
        "name": name_field("name", "név"),
        "surname": name_field("surname", "vezetéknév"),
        "class": choice("class", "kaszt", GAME_DATA["classes"]),
        "level": level,
        "role": choice("role", "szerep", GAME_DATA["roles"]),
        "race": choice("race", "faj", GAME_DATA["races"]),
        "gender": choice("gender", "nem", GAME_DATA["genders"]),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, store: CharacterStore, static_dir: str | None, **kwargs):
        self.store = store
        self.static_dir = static_dir
        super().__init__(*args, directory=static_dir or str(APP_DIR), **kwargs)

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
        elif self.static_dir and not path.startswith(("/api/", "/admin/api/")):
            super().do_GET()
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nem található."})

    def do_HEAD(self):
        if self.static_dir:
            super().do_HEAD()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/admin/api/characters":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Nem található."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY_BYTES:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Hibás kérés."})
            return
        try:
            data = json.loads(self.rfile.read(length))
            character = self.store.add(validate_character(data))
        except json.JSONDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Hibás kérés."})
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        else:
            self.send_json(HTTPStatus.CREATED, character)


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
    static_dir = str(Path(args.static).resolve()) if args.static else None
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, store=store, static_dir=static_dir))
    print(f"Listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
