// Character page: everything from the list plus the equipped gear (from the Blizzard API).

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// One "label: value" row of the details list.
function detail(label, ...value) {
  const row = el("div", "detail");
  const dd = el("dd");
  dd.append(...value);
  row.append(el("dt", null, label), dd);
  return row;
}

// Icon with its name next to it, e.g. the Mage icon + "Mage".
function iconWithName(src, name) {
  const span = el("span", "icon-with-name");
  span.append(icon(src, name), name);
  return span;
}

// Color of the average item level, in the WoW quality order white - green - blue - purple - orange.
// There is no official scale, so this one follows Classic-era item levels:
// - while levelling, gear is compared with the character's level: quest greens are a few item levels above
//   their required level and dungeon blues a bit more, so the gap (ilvl - level) decides;
// - at the level cap (60) fixed bands: dungeon blues are about ilvl 58-65, Molten Core (tier 1) starts at 66,
//   tier 2 (Blackwing Lair) at 76.
const MAX_LEVEL = 60;
const ILVL_GRADES_LEVELLING = [ // [lowest gap, quality, text]
  [15, "legendary", "Kiemelkedő: jóval a szintje fölötti felszerelés"],
  [10, "epic", "Kiváló: bőven a szintje fölötti felszerelés"],
  [5, "rare", "Jó: dungeon-szintű felszerelés"],
  [0, "uncommon", "Rendben: a szintjének megfelelő felszerelés"],
  [-Infinity, "common", "Lemaradt: a szintjénél gyengébb felszerelés"],
];
const ILVL_GRADES_MAX = [ // [lowest item level, quality, text]
  [76, "legendary", "Kiemelkedő: tier 2 (Blackwing Lair) szint és fölötte"],
  [66, "epic", "Raid szint: Molten Core (tier 1) felszerelés"],
  [58, "rare", "Pre-raid: dungeon blue felszerelés"],
  [50, "uncommon", "Kezdő 60-as: quest és dungeon green felszerelés"],
  [-Infinity, "common", "Szintlépés közbeni felszerelés"],
];

function itemLevelGrade(average, level) {
  const [grades, value] = level >= MAX_LEVEL ? [ILVL_GRADES_MAX, average] : [ILVL_GRADES_LEVELLING, average - level];
  const [, quality, text] = grades.find(([lowest]) => value >= lowest);
  return { quality, text };
}

// Blizzard's EU icon host misses some Forever icons (403) that its US host has,
// so on an error try the US one; if that fails too, show an empty icon box.
function setItemIcon(img, url) {
  if (!url) return;
  img.addEventListener("error", () => {
    const fallback = img.src.replace("/forever-eu/", "/forever-us/");
    if (fallback !== img.src) img.src = fallback;
    else img.removeAttribute("src");
  });
  img.src = url;
}

function renderGear(character) {
  const section = el("section", "gear");
  const head = el("div", "list-head");
  head.append(el("h2", null, "Felszerelés"));
  const items = character.equipment || [];
  const average = averageItemLevel(items);
  if (average) {
    const grade = itemLevelGrade(average, character.level);
    const value = el("span", `ilvl-value tooltip quality-${grade.quality}`, String(average));
    value.dataset.tooltip = grade.text;
    const label = el("span", "count", "item level: ");
    label.append(value);
    head.append(label);
  }
  section.append(head);

  if (!character.blizzard || items.length === 0) {
    section.append(el("p", "empty-note",
      "A felszerelés csak a Blizzard által ismert karaktereknél látszik: legalább 10-es szint, és a karakter azóta kilépett a játékból."));
    return section;
  }

  const list = el("ul", "gear-list");
  for (const item of items) {
    const li = el("li", "gear-item");
    const img = el("img", "gear-icon");
    img.alt = "";
    img.width = 36;
    img.height = 36;
    setItemIcon(img, item.icon);
    const text = el("div", "gear-text");
    text.append(el("div", `gear-name quality-${item.quality}`, item.name));
    const meta = [item.slotName, item.type, item.itemLevel ? `ilvl ${item.itemLevel}` : ""].filter(Boolean).join(" · ");
    text.append(el("div", "gear-meta", meta));
    li.append(img, text);
    if (item.tooltip) {
      li.tabIndex = 0; // focus (tap on a phone) also shows the tooltip
      li.classList.add("has-tooltip");
      li.append(itemTooltip(item));
    }
    list.append(li);
  }
  section.append(list);
  return section;
}

// A row with text on the left and optional text on the right, like "Chest      Mail".
function tooltipRow(left, right, className) {
  const row = el("div", `tt-row${className ? ` ${className}` : ""}`);
  row.append(el("span", null, left || ""));
  if (right) row.append(el("span", "tt-right", right));
  return row;
}

// In-game style item tooltip from the lines the Blizzard sync stored (see blizzard.tooltip_from_item).
function itemTooltip(item) {
  const t = item.tooltip;
  const box = el("div", "item-tooltip");
  box.setAttribute("role", "tooltip");
  box.append(el("div", `tt-name quality-${item.quality}`, item.name));
  if (item.itemLevel) box.append(el("div", "tt-ilvl", `Item Level ${item.itemLevel}`));
  if (t.binding) box.append(el("div", null, t.binding));
  if (t.inventoryType || t.subclass) box.append(tooltipRow(t.inventoryType, t.subclass));
  if (t.damage || t.speed) box.append(tooltipRow(t.damage, t.speed));
  if (t.dps) box.append(el("div", null, t.dps));
  if (t.armor) box.append(el("div", null, t.armor));
  for (const stat of t.stats || []) {
    const line = el("div", null, stat.text);
    if (stat.color) line.style.color = stat.color;
    box.append(line);
  }
  for (const enchant of t.enchantments || []) box.append(el("div", "tt-green", enchant));
  if (t.durability) box.append(el("div", null, t.durability));
  if (t.requirement) box.append(el("div", null, t.requirement));
  for (const spell of t.spells || []) box.append(el("div", "tt-green", spell));
  if (t.description) box.append(el("div", "tt-description", `"${t.description}"`));

  const price = t.sellPrice || {};
  const coins = [["gold", "g"], ["silver", "s"], ["copper", "c"]].filter(([key]) => price[key]);
  if (coins.length) {
    const line = el("div", "tt-price", "Sell Price: ");
    for (const [key, unit] of coins) line.append(el("span", `coin coin-${key}`, `${price[key]}${unit}`), " ");
    box.append(line);
  }
  return box;
}

function renderCharacter(container, character, gameData) {
  const cls = gameData.classes[character.class] || { name: character.class, color: null };
  const raceName = gameData.races[character.race] || character.race;
  const gender = character.gender === "female" ? "female" : "male";
  document.title = `${character.name} ${character.surname} – Imbul Forever`;

  const card = el("div", "character-card");
  if (cls.color) card.style.setProperty("--class-color", cls.color);

  const title = el("div", "character-title");
  title.append(el("h2", "name", `${character.name} ${character.surname}`));
  if (character.guild) title.append(el("div", "guild", `<${character.guild}>`));
  card.append(title);

  const details = el("dl", "details");
  details.append(detail("Kié", character.owner || "—"));
  const factionName = gameData.factions[character.faction];
  details.append(detail("Frakció", factionName ? iconWithName(`/icons/faction/${character.faction}.jpg`, factionName) : "—"));
  details.append(detail("Kaszt", iconWithName(`/icons/class/${character.class}.jpg`, cls.name)));
  details.append(detail("Szint", String(character.level)));
  details.append(detail("Faj", iconWithName(`/icons/race/${character.race}_${gender}.jpg`, raceName)));

  const professions = (character.professions || []).filter((key) => gameData.professions[key]);
  const professionList = el("span", "icon-list-names");
  for (const key of professions) {
    professionList.append(iconWithName(`/icons/profession/${key}.jpg`, gameData.professions[key].name));
  }
  details.append(detail("Szakmák", professions.length ? professionList : "—"));

  details.append(detail("Játékmód", character.role ? (gameData.roles[character.role] || character.role) : "—"));
  const refreshed = lastRefresh(character);
  details.append(detail("Utoljára frissült", refreshed ? relativeTime(refreshed) : "—"));
  details.append(detail("Utolsó belépés", character.lastLogin ? relativeTime(character.lastLogin) : "—"));
  card.append(details);

  container.replaceChildren(card, renderGear(character));
}

async function main() {
  const container = document.getElementById("character");
  const id = new URLSearchParams(location.search).get("id");

  async function load({ keepOnError = false } = {}) {
    try {
      const [gameData, characters] = await Promise.all([loadGameData(), loadCharacters()]);
      const character = characters.find((c) => c.id === id);
      if (!character) {
        container.replaceChildren(el("p", "empty", "Ez a karakter nincs a listán."));
        return;
      }
      // Don't redraw under an open item tooltip; the next refresh catches up.
      if (keepOnError && container.querySelector(".gear-item:hover, .gear-item:focus")) return;
      renderCharacter(container, character, gameData);
    } catch (error) {
      console.error("Failed to load the character", error);
      if (!keepOnError) container.replaceChildren(el("p", "empty", "Nem sikerült betölteni a karaktert."));
    }
  }

  await load();
  startAutoRefresh(() => load({ keepOnError: true }));
}

main();
