"""Background sync of WoW: Forever characters from the Blizzard Battle.net API (standard library only).

WoW: Forever has no realms: a character is addressed by "{name}-{surname}" in the
`profile-forever-{region}` namespace, e.g. /profile/wow/character/bonk-donkus.
Not every character is available all the time (the API answers 404 for characters it has
no profile for yet, and sometimes while a character is online), so a 404 never removes data:
the character simply keeps what it had.
"""

import base64
import json
import os
import tempfile
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

    def get(self, path: str, namespace: str | None = None) -> dict | None:
        """GET an API resource (profile namespace by default); returns None on 404, raises on other errors."""
        url = f"https://{self.region}.api.blizzard.com{path}?namespace={namespace or self.namespace}&locale=en_GB"
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


# Slot order of the in-game character sheet.
SLOT_ORDER = [
    "HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST",
    "HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2",
    "MAIN_HAND", "OFF_HAND", "RANGED", "AMMO",
]


def equipment_from_response(response: dict) -> list:
    """Equipped items in character-sheet order, reduced to what the character page shows."""
    items = []
    for item in response.get("equipped_items", []):
        slot = item.get("slot") or {}
        items.append({
            "slot": slot.get("type", ""),
            "slotName": slot.get("name", ""),
            "itemId": (item.get("item") or {}).get("id"),
            "mediaId": (item.get("media") or {}).get("id"),
            "mediaNamespace": urllib.parse.parse_qs(
                urllib.parse.urlparse(((item.get("media") or {}).get("key") or {}).get("href", "")).query
            ).get("namespace", [""])[0],
            "name": item.get("name", ""),
            "quality": ((item.get("quality") or {}).get("type") or "COMMON").lower(),
            "itemLevel": (item.get("level") or {}).get("value"),
            "type": (item.get("item_subclass") or {}).get("name", ""),
            "tooltip": tooltip_from_item(item),
        })
    order = {slot: i for i, slot in enumerate(SLOT_ORDER)}
    return sorted(items, key=lambda i: order.get(i["slot"], len(order)))


def css_color(color: dict | None) -> str | None:
    """Blizzard's {r, g, b, a} display color as a CSS hex color; None for plain white."""
    if not color:
        return None
    r, g, b = (int(color.get(key, 255)) for key in ("r", "g", "b"))
    return None if (r, g, b) == (255, 255, 255) else f"#{r:02x}{g:02x}{b:02x}"


def tooltip_from_item(item: dict) -> dict:
    """The lines of an in-game style item tooltip, using Blizzard's own display strings."""
    def text(value, key="display_string"):
        return (value or {}).get(key) or None

    subclass = None if item.get("is_subclass_hidden") else (item.get("item_subclass") or {}).get("name")
    weapon = item.get("weapon") or {}
    price = (item.get("sell_price") or {}).get("display_strings") or {}
    tooltip = {
        "binding": (item.get("binding") or {}).get("name"),
        "inventoryType": (item.get("inventory_type") or {}).get("name"),
        "subclass": subclass,
        "damage": text(weapon.get("damage")),
        "speed": text(weapon.get("attack_speed")),
        "dps": text(weapon.get("dps")),
        "armor": text((item.get("armor") or {}).get("display")),
        "stats": [
            {"text": stat["display"]["display_string"], "color": css_color(stat["display"].get("color"))}
            for stat in item.get("stats", []) if (stat.get("display") or {}).get("display_string")
        ],
        "enchantments": [e["display_string"] for e in item.get("enchantments", []) if e.get("display_string")],
        "spells": [s["description"] for s in item.get("spells", []) if s.get("description")],
        "durability": text(item.get("durability")),
        "requirement": text((item.get("requirements") or {}).get("level")),
        "description": item.get("description"),
        "sellPrice": {k: int(price[k]) for k in ("gold", "silver", "copper") if str(price.get(k, "")).isdigit()},
    }
    # Leave out empty lines so the stored data stays small.
    return {key: value for key, value in tooltip.items() if value}


class IconCache:
    """Item icon URLs by media id, kept in a JSON file so each icon is looked up only once."""

    def __init__(self, path):
        self.path = path
        try:
            self.icons = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.icons = {}

    def get(self, client: "BlizzardClient", media_id, namespace: str) -> str | None:
        key = str(media_id)
        if key not in self.icons and media_id and namespace:
            media = client.get(f"/data/wow/media/item/{media_id}", namespace)
            assets = (media or {}).get("assets", [])
            self.icons[key] = next((a["value"] for a in assets if a.get("key") == "icon"), None)
            self._save()
        return self.icons.get(key)

    def _save(self) -> None:
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(self.icons, f)
        os.replace(tmp, self.path)


def professions_from_response(response: dict, game_data: dict) -> list:
    """Primary professions we know, in game-data order."""
    names = {key_from_name((p.get("profession") or {}).get("name", "")) for p in response.get("primaries", [])}
    return [key for key in game_data["professions"] if key in names]


class BlizzardSync:
    """Every `interval` seconds fetch all characters; professions only every `professions_interval` seconds."""

    def __init__(self, store, client: BlizzardClient, game_data: dict, icon_cache_path,
                 interval: int = 60, professions_interval: int = 900, equipment_interval: int = 300):
        self.store = store
        self.client = client
        self.game_data = game_data
        self.icons = IconCache(icon_cache_path)
        self.interval = interval
        self.professions_interval = professions_interval
        self.equipment_interval = equipment_interval
        self.last_sync = None  # ISO time of the last completed sync run
        self._professions_fetched = {}  # character id -> time.time() of the last professions fetch
        self._equipment_fetched = {}  # character id -> time.time() of the last equipment fetch

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

        last = self._equipment_fetched.get(character["id"], 0)
        if time.time() - last >= self.equipment_interval:
            response = self.client.get(path + "/equipment")
            self._equipment_fetched[character["id"]] = time.time()
            if response is not None:
                equipment = equipment_from_response(response)
                for item in equipment:
                    item["icon"] = self.icons.get(self.client, item.pop("mediaId"), item.pop("mediaNamespace"))
                fields["equipment"] = equipment

        last = self._professions_fetched.get(character["id"], 0)
        if time.time() - last >= self.professions_interval:
            response = self.client.get(path + "/professions")
            self._professions_fetched[character["id"]] = time.time()
            if response is not None:
                fields["professions"] = professions_from_response(response, self.game_data)
        return fields
