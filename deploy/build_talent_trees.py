#!/usr/bin/env python3
"""Builds talent-trees.json, the full talent trees of every class, from Blizzard's static game data.

Characters only list the talents they have, so the page needs this to draw the whole tree. The data changes only
with a game patch: rerun this then, with the static namespace of the patch (it is in the item links of any
/equipment response), and commit the result.

    BNET_CLIENT_ID=... BNET_CLIENT_SECRET=... python3 deploy/build_talent_trees.py [namespace]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import blizzard  # noqa: E402

DEFAULT_NAMESPACE = "static-1.60.1_70399-forever-eu"
ROWS = 7
COLUMNS = 4
# A class's trees share one grid; these are the columns where its first, second and third tree start.
TREE_START_COLUMNS = (1, 7, 14)


def link_path(link: dict) -> str:
    return urllib.parse.urlparse(link["key"]["href"]).path


def get(client, path: str, namespace: str) -> dict | None:
    """client.get, waiting and retrying when Blizzard says there are too many requests."""
    for attempt in range(6):
        try:
            return client.get(path, namespace)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(2 ** attempt)


def build_tree(client, namespace: str, tree_link: dict) -> tuple[str, dict]:
    tree = get(client, link_path(tree_link), namespace)
    nodes = tree["spec_talent_nodes"]
    # Blizzard's data has a few leftover nodes far outside the grid (some repeat a talent that is also in it).
    first_col = max(start for start in TREE_START_COLUMNS if start <= min(n["display_col"] for n in nodes))
    on_grid = lambda n: 1 <= n["display_row"] <= ROWS and first_col <= n["display_col"] < first_col + COLUMNS
    for node in nodes:
        if not on_grid(node):
            name = node["ranks"][0]["tooltip"]["talent"]["name"]
            print(f"left out: {tree['playable_class']['name']} {tree['name']}: {name}", flush=True)
    nodes = [node for node in nodes if on_grid(node)]
    talent_of_node = {node["id"]: node["ranks"][0]["tooltip"]["talent"]["id"] for node in nodes}
    talents = []
    for node in nodes:
        first = node["ranks"][0]["tooltip"]
        talents.append({
            "id": first["talent"]["id"],
            "name": first["talent"]["name"],
            "row": node["display_row"] - 1,
            "col": node["display_col"] - first_col,
            "spell": first["spell_tooltip"]["spell"]["id"],
            "requires": [talent_of_node[n] for n in node.get("locked_by", []) if n in talent_of_node],
            "castTime": first["spell_tooltip"].get("cast_time"),
            "ranks": [rank["tooltip"]["spell_tooltip"].get("description", "") for rank in node["ranks"]],
        })
    talents.sort(key=lambda t: (t["row"], t["col"]))
    spec = tree["playable_specialization"]
    media = get(client, f"/data/wow/media/playable-specialization/{spec['id']}", namespace) or {}
    icon = next((a["value"] for a in media.get("assets", []) if a.get("key") == "icon"), None)
    entry = {"id": spec["id"], "name": tree["name"], "icon": icon, "talents": talents}
    return blizzard.key_from_name(tree["playable_class"]["name"]), entry


def add_icon(client, namespace: str, talent: dict) -> None:
    media = get(client, f"/data/wow/media/spell/{talent.pop('spell')}", namespace) or {}
    talent["icon"] = next((a["value"] for a in media.get("assets", []) if a.get("key") == "icon"), None)


def main() -> None:
    namespace = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_NAMESPACE
    client = blizzard.BlizzardClient(os.environ["BNET_CLIENT_ID"], os.environ["BNET_CLIENT_SECRET"])
    index = get(client, "/data/wow/talent-tree/index", namespace)  # also gets the token before the threads start
    classes = {}
    with ThreadPoolExecutor(max_workers=2) as pool:  # the request limit is shared with the live sync
        built = list(pool.map(lambda link: build_tree(client, namespace, link), index["spec_talent_trees"]))
        for class_key, tree in built:
            classes.setdefault(class_key, []).append(tree)
        talents = [talent for trees in classes.values() for tree in trees for talent in tree["talents"]]
        list(pool.map(lambda talent: add_icon(client, namespace, talent), talents))
    path = ROOT / "talent-trees.json"
    path.write_text(json.dumps(classes, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{path.name}: {len(classes)} classes, {len(built)} trees, {len(talents)} talents")


if __name__ == "__main__":
    main()
