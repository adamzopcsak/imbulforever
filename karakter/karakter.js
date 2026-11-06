// Character page: everything from the list plus the gear, stats, talents and reputations (from the Blizzard API).

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

// The slots as on an in-game character sheet: two columns beside the character, weapons below.
const SHEET_SLOTS = {
  left: ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST"],
  right: ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"],
  bottom: ["MAIN_HAND", "OFF_HAND", "RANGED", "AMMO"],
};
// Names of the empty slots; filled ones show the name Blizzard sends. English like all game terms here.
const SLOT_NAMES = {
  HEAD: "Head", NECK: "Neck", SHOULDER: "Shoulder", BACK: "Back", CHEST: "Chest", SHIRT: "Shirt", TABARD: "Tabard",
  WRIST: "Wrist", HANDS: "Hands", WAIST: "Waist", LEGS: "Legs", FEET: "Feet", FINGER_1: "Finger", FINGER_2: "Finger",
  TRINKET_1: "Trinket", TRINKET_2: "Trinket", MAIN_HAND: "Main Hand", OFF_HAND: "Off Hand", RANGED: "Ranged", AMMO: "Ammo",
};

function gearSlot(slot, item) {
  const li = el("li", "gear-item");
  if (!item) {
    li.classList.add("gear-empty");
    li.append(el("span", "gear-icon"), el("div", "gear-text gear-meta", SLOT_NAMES[slot]));
    return li;
  }
  const img = el("img", `gear-icon quality-${item.quality}`);
  img.alt = "";
  img.width = 40;
  img.height = 40;
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
  return li;
}

function renderSheet(character, items) {
  const bySlot = Object.fromEntries(items.map((item) => [item.slot, item]));
  const column = (name) => {
    const list = el("ul", `gear-column gear-${name}`);
    list.append(...SHEET_SLOTS[name].map((slot) => gearSlot(slot, bySlot[slot])));
    return list;
  };
  // Blizzard has no picture for every character; the class icon stands in for those.
  const portrait = el("div", "gear-portrait");
  const showClassIcon = () => {
    const img = el("img", "gear-portrait-class");
    img.src = `/icons/class/${character.class}.jpg`;
    img.alt = "";
    portrait.replaceChildren(img);
  };
  if (character.render) {
    const img = el("img", "gear-portrait-render");
    img.src = character.render;
    img.alt = `${character.name} ${character.surname}`;
    img.addEventListener("error", showClassIcon);
    portrait.append(img);
  } else {
    showClassIcon();
  }
  const sheet = el("div", "gear-sheet");
  sheet.append(column("left"), portrait, column("right"), column("bottom"));
  return sheet;
}

function renderGear(character) {
  const section = el("section", "gear");
  const head = el("div", "list-head");
  head.append(el("h2", null, t("Felszerelés")));
  const items = character.equipment || [];
  const average = averageItemLevel(items);
  if (average) {
    const grade = itemLevelGrade(average, character.level);
    const value = el("span", `ilvl-value tooltip quality-${grade.quality}`, String(average));
    value.dataset.tooltip = t(grade.text);
    const label = el("span", "count", "item level: ");
    label.append(value);
    head.append(label);
  }
  section.append(head);

  if (!character.blizzard || items.length === 0) {
    section.append(el("p", "empty-note",
      t("A felszerelés csak a Blizzard által ismert karaktereknél látszik: legalább 10-es szint, és a karakter azóta kilépett a játékból.")));
    return section;
  }

  section.append(renderSheet(character, items));
  return section;
}

// Round to at most two decimals, without trailing zeros.
const number = (value) => String(Math.round(value * 100) / 100);
const percent = (value) => `${value.toFixed(2)}%`;

// A section in the in-game look, its title and the panels under it.
function ingameSection(title, note) {
  const section = el("section", "ingame-section");
  const head = el("div", "list-head");
  head.append(el("h2", null, title));
  if (note) head.append(el("span", "count", note));
  section.append(head);
  return section;
}

// A "Strength   52" line of the character sheet. Like in the game, a value above its base is green, below it red.
function statLine(label, value, base) {
  const row = el("div", "stat-line");
  row.append(el("span", "stat-label", label));
  const shown = el("span", "stat-value", typeof value === "number" ? number(value) : value);
  if (typeof base === "number" && typeof value === "number" && base !== value) {
    shown.classList.add(value > base ? "stat-up" : "stat-down");
    shown.title = `${number(base)} ${value > base ? "+" : "-"} ${number(Math.abs(value - base))}`;
  }
  row.append(shown);
  return row;
}

function statPanel(title, lines) {
  const panel = el("div", "ingame-panel stat-panel");
  panel.append(el("h3", null, title), ...lines);
  return panel;
}

function weaponLines(hand, label) {
  return [
    statLine(`${label} Damage`, `${Math.round(hand.damage_min)} - ${Math.round(hand.damage_max)}`),
    statLine(`${label} Speed`, hand.speed.toFixed(2)),
    statLine(`${label} DPS`, hand.dps.toFixed(1)),
  ];
}

// Health and power like the bars on the unit frame.
function statBar(label, value, kind) {
  const bar = el("div", `stat-bar stat-bar-${kind}`);
  bar.append(el("span", null, `${label}: ${number(value)}`));
  return bar;
}

function renderStats(character) {
  const stats = character.stats;
  if (!stats) return null;
  const section = ingameSection(t("Statok"));
  const bars = el("div", "stat-bars");
  bars.append(statBar("Health", stats.health, "health"));
  if (stats.powerType) bars.append(statBar(stats.powerType, stats.power, stats.powerType.toLowerCase()));
  section.append(bars);

  // Without a weapon in the off hand the API still sends bare-hand numbers, so those stay hidden.
  const offHandItem = (character.equipment || []).find((item) => item.slot === "OFF_HAND");
  const melee = [...weaponLines(stats.mainHand, "Main Hand")];
  if (offHandItem?.tooltip?.damage) melee.push(...weaponLines(stats.offHand, "Off Hand"));
  melee.push(statLine("Attack Power", stats.attackPower), statLine("Crit Chance", percent(stats.meleeCrit)));
  const spell = [statLine("Spell Power", stats.spellPower), statLine("Crit Chance", percent(stats.spellCrit))];
  if (stats.powerType === "Mana") {
    spell.push(statLine("Mana Regen", number(stats.manaRegen)), statLine("Regen in Combat", number(stats.manaRegenCombat)));
  }

  const panels = el("div", "stat-panels");
  panels.append(
    statPanel("Base Stats", ["strength", "agility", "stamina", "intellect", "spirit"].map((key) =>
      statLine(key[0].toUpperCase() + key.slice(1), stats[key].effective, stats[key].base))),
    statPanel("Melee", melee),
    statPanel("Ranged", [statLine("Crit Chance", percent(stats.rangedCrit))]),
    statPanel("Spell", spell),
    statPanel("Defense", [
      statLine("Armor", stats.armor.effective, stats.armor.base),
      statLine("Dodge", percent(stats.dodge)),
      statLine("Parry", percent(stats.parry)),
      statLine("Block", percent(stats.block)),
    ]),
    statPanel("Resistances", Object.entries(stats.resistances).map(([school, value]) =>
      statLine(school[0].toUpperCase() + school.slice(1), value.effective, value.base))),
  );
  section.append(panels);
  return section;
}

// The talent grid, as in the game: rows open every 5 points spent in the tree.
const TALENT_COLUMNS = 4;
const TALENT_ROWS = 7;
const TALENT_POINTS_PER_ROW = 5;
const TALENT_CELL = 44; // keep in sync with --talent-cell in style.css
const TALENT_GAP = 12; // keep in sync with --talent-gap in style.css

// The character gets the first talent point at level 10, then one on every level.
function talentPoints(level) {
  return Math.max(0, level - 9);
}

function talentTooltip(talent, rank, tree, state) {
  const box = el("div", "item-tooltip");
  box.setAttribute("role", "tooltip");
  box.append(el("div", "tt-name", talent.name));
  box.append(el("div", null, `Rank ${rank}/${talent.ranks.length}`));
  if (talent.castTime) box.append(el("div", null, talent.castTime));
  if (rank < talent.ranks.length && state.rowLocked) {
    box.append(el("div", "tt-red", `Requires ${talent.row * TALENT_POINTS_PER_ROW} points in ${tree.name} Talents`));
  }
  if (rank < talent.ranks.length) {
    for (const name of state.missing) box.append(el("div", "tt-red", `Requires ${name}`));
  }
  if (rank > 0) box.append(el("div", "tt-description", talent.ranks[rank - 1]));
  if (rank < talent.ranks.length) {
    if (rank > 0) box.append(el("div", "tt-next", "Next rank:"));
    box.append(el("div", "tt-description", talent.ranks[rank]));
  }
  return box;
}

// The arrows between a talent and the one it requires, over the same grid as the talents.
function talentArrows(tree, ranks) {
  const pitch = TALENT_CELL + TALENT_GAP;
  const width = TALENT_COLUMNS * TALENT_CELL + (TALENT_COLUMNS - 1) * TALENT_GAP;
  const height = TALENT_ROWS * TALENT_CELL + (TALENT_ROWS - 1) * TALENT_GAP;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "talent-arrows");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const byId = Object.fromEntries(tree.talents.map((talent) => [talent.id, talent]));
  const centre = (index) => index * pitch + TALENT_CELL / 2;
  for (const talent of tree.talents) {
    for (const id of talent.requires) {
      const from = byId[id];
      if (!from) continue;
      const x1 = centre(from.col), y1 = centre(from.row), x2 = centre(talent.col), y2 = centre(talent.row);
      let points;
      if (from.row === talent.row) {
        const side = x2 > x1 ? 1 : -1;
        points = [[x1 + side * TALENT_CELL / 2, y1], [x2 - side * (TALENT_CELL / 2 + 2), y2]];
      } else if (from.col === talent.col) {
        points = [[x1, y1 + TALENT_CELL / 2], [x2, y2 - TALENT_CELL / 2 - 2]];
      } else {
        const side = x2 > x1 ? 1 : -1;
        points = [[x1 + side * TALENT_CELL / 2, y1], [x2, y1], [x2, y2 - TALENT_CELL / 2 - 2]];
      }
      const done = (ranks[id] || 0) >= from.ranks.length;
      const line = document.createElementNS(svgNS, "polyline");
      line.setAttribute("points", points.map((point) => point.join(",")).join(" "));
      line.setAttribute("class", done ? "talent-arrow talent-arrow-open" : "talent-arrow");
      const [lastX, lastY] = points[points.length - 1];
      const [beforeX, beforeY] = points[points.length - 2];
      const dx = Math.sign(lastX - beforeX), dy = Math.sign(lastY - beforeY);
      const head = document.createElementNS(svgNS, "polygon");
      head.setAttribute("points", [
        [lastX + dx * 2, lastY + dy * 2],
        [lastX - dx * 4 - dy * 5, lastY - dy * 4 - dx * 5],
        [lastX - dx * 4 + dy * 5, lastY - dy * 4 + dx * 5],
      ].map((point) => point.join(",")).join(" "));
      head.setAttribute("class", done ? "talent-head talent-arrow-open" : "talent-head");
      svg.append(line, head);
    }
  }
  return svg;
}

function renderTree(tree, spec, canSpend) {
  const ranks = spec?.ranks || {};
  const spent = spec?.spent || 0;
  const panel = el("div", "ingame-panel talent-tree");
  const head = el("div", "talent-tree-head");
  if (tree.icon) {
    const img = el("img", "talent-tree-icon");
    img.alt = "";
    setItemIcon(img, tree.icon);
    head.append(img);
  }
  head.append(el("h3", null, tree.name), el("span", "talent-tree-points", String(spent)));
  panel.append(head);

  const grid = el("div", "talent-grid");
  grid.append(talentArrows(tree, ranks));
  const byId = Object.fromEntries(tree.talents.map((talent) => [talent.id, talent]));
  for (const talent of tree.talents) {
    const rank = ranks[talent.id] || 0;
    const rowLocked = spent < talent.row * TALENT_POINTS_PER_ROW;
    const missing = talent.requires
      .map((id) => byId[id])
      .filter((required) => required && (ranks[required.id] || 0) < required.ranks.length)
      .map((required) => required.name);
    const maxed = rank >= talent.ranks.length;
    const open = !rowLocked && missing.length === 0;
    const state = maxed ? "maxed" : rank > 0 ? "learned" : open && canSpend ? "open" : "locked";
    const cell = el("div", `talent talent-${state}`);
    cell.style.gridRow = String(talent.row + 1);
    cell.style.gridColumn = String(talent.col + 1);
    cell.style.setProperty("--col", String(talent.col));
    if (talent.row >= TALENT_ROWS - 2) cell.classList.add("talent-bottom");
    cell.tabIndex = 0; // focus (tap on a phone) also shows the tooltip
    const img = el("img", "talent-icon");
    img.alt = talent.name;
    setItemIcon(img, talent.icon);
    cell.append(img);
    if (rank > 0 || open) cell.append(el("span", "talent-rank", `${rank}/${talent.ranks.length}`));
    cell.append(talentTooltip(talent, rank, tree, { rowLocked, missing }));
    grid.append(cell);
  }
  panel.append(grid);
  return panel;
}

// The tree with the most points counts as the character's spec: the API does not name an active one.
function activeSpec(character, trees) {
  const spec = (character.talents || [])
    .filter((entry) => entry.spent > 0)
    .reduce((best, entry) => (!best || entry.spent > best.spent ? entry : best), null);
  return spec && trees?.find((tree) => tree.id === spec.id);
}

function renderTalents(character, trees) {
  if (!character.talents || !trees) return null;
  const spent = character.talents.reduce((sum, spec) => sum + spec.spent, 0);
  const unspent = Math.max(0, talentPoints(character.level) - spent);
  const section = ingameSection(t("Talentek"), t("Elköltött: {spent} · El nem költött: {unspent}", { spent, unspent }));
  const list = el("div", "talent-trees");
  list.append(...trees.map((tree) => renderTree(tree, character.talents.find((spec) => spec.id === tree.id), unspent > 0)));
  section.append(list);
  return section;
}

function renderReputations(character) {
  const reputations = character.reputations || [];
  if (reputations.length === 0) return null;
  const section = ingameSection(t("Hírnév"));
  const panel = el("div", "ingame-panel reputation-panel");
  for (const reputation of reputations) {
    const row = el("div", "reputation");
    row.append(el("span", "reputation-name", reputation.name));
    const bar = el("div", `reputation-bar standing-${reputation.standing.toLowerCase()}`);
    const fill = el("span", "reputation-fill");
    fill.style.width = `${reputation.max ? Math.min(100, reputation.value / reputation.max * 100) : 100}%`;
    const text = reputation.max ? `${reputation.standing} ${reputation.value}/${reputation.max}` : reputation.standing;
    bar.append(fill, el("span", "reputation-text", text));
    row.append(bar);
    panel.append(row);
  }
  section.append(panel);
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

function renderCharacter(container, character, gameData, talentTrees) {
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
  details.append(detail(t("Kié"), character.owner || "—"));
  const factionName = gameData.factions[character.faction];
  details.append(detail(t("Frakció"), factionName ? iconWithName(`/icons/faction/${character.faction}.jpg`, factionName) : "—"));
  details.append(detail(t("Kaszt"), iconWithName(`/icons/class/${character.class}.jpg`, cls.name)));
  details.append(detail(t("Szint"), String(character.level)));
  const trees = talentTrees?.[character.class];
  const spec = activeSpec(character, trees);
  details.append(detail(t("Aktív spec"), spec?.name || "—"));
  const fullName = `${character.name} ${character.surname}`;
  details.append(detail(t("Titulus"), character.title ? character.title.replace("{name}", fullName) : "—"));
  details.append(detail(t("Faj"), iconWithName(`/icons/race/${character.race}_${gender}.jpg`, raceName)));

  const professions = (character.professions || []).filter((key) => gameData.professions[key]);
  const professionList = el("span", "icon-list-names");
  for (const key of professions) {
    const skill = character.professionSkills?.[key];
    const label = skill ? `${gameData.professions[key].name} ${skill.points}/${skill.max}` : gameData.professions[key].name;
    professionList.append(iconWithName(`/icons/profession/${key}.jpg`, label));
  }
  details.append(detail(t("Szakmák"), professions.length ? professionList : "—"));

  details.append(detail(t("Játékmód"), character.role ? (gameData.roles[character.role] || character.role) : "—"));
  const refreshed = lastRefresh(character);
  details.append(detail(t("Utoljára frissült"), refreshed ? relativeTime(refreshed) : "—"));
  details.append(detail(t("Utolsó belépés"), character.lastLogin ? relativeTime(character.lastLogin) : "—"));
  card.append(details);

  const sections = [card, renderGear(character), renderStats(character), renderTalents(character, trees), renderReputations(character)];
  container.replaceChildren(...sections.filter(Boolean));
}

// Loaded once per page; without it the page still works, just with no talent trees.
let talentTreesRequest = null;
function loadTalentTrees() {
  talentTreesRequest ??= fetchJson("/talent-trees.json").catch((error) => {
    console.error("Failed to load the talent trees", error);
    talentTreesRequest = null;
    return null;
  });
  return talentTreesRequest;
}

async function main() {
  const container = document.getElementById("character");
  const id = new URLSearchParams(location.search).get("id");

  async function load({ keepOnError = false } = {}) {
    try {
      const [gameData, characters, talentTrees] = await Promise.all([loadGameData(), loadCharacters(), loadTalentTrees()]);
      const character = characters.find((c) => c.id === id);
      if (!character) {
        container.replaceChildren(el("p", "empty", t("Ez a karakter nincs a listán.")));
        return;
      }
      // Don't redraw under an open tooltip; the next refresh catches up.
      if (keepOnError && container.querySelector(".gear-item:hover, .gear-item:focus, .talent:hover, .talent:focus")) return;
      renderCharacter(container, character, gameData, talentTrees);
    } catch (error) {
      console.error("Failed to load the character", error);
      if (!keepOnError) container.replaceChildren(el("p", "empty", t("Nem sikerült betölteni a karaktert.")));
    }
  }

  await load();
  startAutoRefresh(() => load({ keepOnError: true }));
}

main();
