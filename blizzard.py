"""Background sync of WoW: Forever characters from the Blizzard Battle.net API (standard library only).

WoW: Forever has no realms: a character is addressed by "{name}-{surname}" in the
`profile-forever-{region}` namespace, e.g. /profile/wow/character/bonk-donkus.
Not every character is available all the time (the API answers 404 for characters it has
no profile for yet, and sometimes while a character is online), so a 404 never removes data:
the character simply keeps what it had.
"""

import base64
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TOKEN_URL = "https://oauth.battle.net/token"
REQUEST_TIMEOUT = 20

# Blizzard API values -> our game-data keys.
GENDERS = {"MALE": "male", "FEMALE": "female"}
FACTIONS = {"ALLIANCE": "alliance", "HORDE": "horde"}
RULESETS = {1: "pvp", 2: "normal", 3: "roleplay", 15: "roleplay-pvp"}


def key_from_name(name: str) -> str:
    """'Night Elf' -> 'nightelf', 'First Aid' -> 'firstaid'."""
    return "".join(name.split()).lower()


def iso_from_millis(millis: int) -> str:
    return datetime.fromtimestamp(millis / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class BlizzardClient:
    """Client-credentials token and GET requests against the Battle.net API."""

    def __init__(self, client_id: str, client_secret: str, region: str = "eu"):
        self.client_id = client_id
        self.client_secret = client_secret
        self.region = region
        self.namespace = f"profile-forever-{region}"
        self._token = None
        self._token_expires = 0.0

    def _get_token(self) -> str:
        if self._token and time.time() < self._token_expires - 60:
            return self._token
        auth = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        request = urllib.request.Request(
            TOKEN_URL,
            data=b"grant_type=client_credentials",
            headers={"Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            payload = json.load(response)
        self._token = payload["access_token"]
        self._token_expires = time.time() + int(payload.get("expires_in", 3600))
        return self._token

    def get(self, path: str) -> dict | None:
        """GET a profile resource; returns None on 404, raises on other errors."""
        url = f"https://{self.region}.api.blizzard.com{path}?namespace={self.namespace}&locale=en_GB"
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + self._get_token()})
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code == 401:
                self._token = None  # expired or revoked: get a new one next time
            raise

    def character_path(self, name: str, surname: str) -> str:
        slug = urllib.parse.quote(f"{name}-{surname}".lower())
        return f"/profile/wow/character/{slug}"


def fields_from_profile(profile: dict, game_data: dict) -> dict:
    """Map a Blizzard character profile to our character fields; unknown values are left out."""
    fields = {"lastLogin": iso_from_millis(profile["last_login_timestamp"])} if profile.get("last_login_timestamp") else {}

    # Always set, so leaving a guild clears it.
    fields["guild"] = (profile.get("guild") or {}).get("name", "")

    level = profile.get("level")
    if isinstance(level, int) and 1 <= level <= game_data["maxLevel"]:
        fields["level"] = level

    cls = key_from_name((profile.get("character_class") or {}).get("name", ""))
    if cls in game_data["classes"]:
        fields["class"] = cls

    race = key_from_name((profile.get("race") or {}).get("name", ""))
    if race in game_data["races"]:
        fields["race"] = race

    gender = GENDERS.get((profile.get("gender") or {}).get("type"))
    if gender:
        fields["gender"] = gender

    faction = FACTIONS.get((profile.get("faction") or {}).get("type"))
    if faction:
        fields["faction"] = faction

    ruleset = RULESETS.get((profile.get("ruleset") or {}).get("id"))
    if ruleset in game_data["roles"]:
        fields["role"] = ruleset

    return fields


def professions_from_response(response: dict, game_data: dict) -> list:
    """Primary professions we know, in game-data order."""
    names = {key_from_name((p.get("profession") or {}).get("name", "")) for p in response.get("primaries", [])}
    return [key for key in game_data["professions"] if key in names]


class BlizzardSync:
    """Every `interval` seconds fetch all characters; professions only every `professions_interval` seconds."""

    def __init__(self, store, client: BlizzardClient, game_data: dict, interval: int = 60, professions_interval: int = 900):
        self.store = store
        self.client = client
        self.game_data = game_data
        self.interval = interval
        self.professions_interval = professions_interval
        self.last_sync = None  # ISO time of the last completed sync run
        self._professions_fetched = {}  # character id -> time.time() of the last professions fetch

    def start(self) -> None:
        threading.Thread(target=self._run, name="blizzard-sync", daemon=True).start()

    def _run(self) -> None:
        while True:
            started = time.time()
            try:
                self.sync_once()
            except Exception as error:  # keep the thread alive whatever happens
                print(f"Blizzard sync failed: {error!r}", flush=True)
            time.sleep(max(5, self.interval - (time.time() - started)))

    def sync_once(self) -> None:
        updates = {}
        for character in self.store.list():
            try:
                fields = self._fetch_character(character)
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                print(f"Blizzard sync: {character.get('name')} {character.get('surname')}: {error!r}", flush=True)
                continue
            if fields:
                updates[character["id"]] = fields
        if updates:
            self.store.apply_sync(updates)
        self.last_sync = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _fetch_character(self, character: dict) -> dict | None:
        path = self.client.character_path(character["name"], character["surname"])
        profile = self.client.get(path)
        if profile is None:
            return None
        fields = fields_from_profile(profile, self.game_data)
        fields["blizzard"] = True

        last = self._professions_fetched.get(character["id"], 0)
        if time.time() - last >= self.professions_interval:
            response = self.client.get(path + "/professions")
            self._professions_fetched[character["id"]] = time.time()
            if response is not None:
                fields["professions"] = professions_from_response(response, self.game_data)
        return fields
