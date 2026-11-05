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

// Average item level of the equipped gear; shirt, tabard and ammo do not count.
function averageItemLevel(items) {
  const levels = items
    .filter((item) => !["SHIRT", "TABARD", "AMMO"].includes(item.slot) && item.itemLevel)
    .map((item) => item.itemLevel);
  return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null;
}

function renderGear(character) {
  const section = el("section", "gear");
  const head = el("div", "list-head");
  head.append(el("h2", null, "Felszerelés"));
  const items = character.equipment || [];
  const average = averageItemLevel(items);
  if (average) head.append(el("span", "count", `átlagos item level: ${average}`));
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
    if (item.icon) img.src = item.icon;
    const text = el("div", "gear-text");
    text.append(el("div", `gear-name quality-${item.quality}`, item.name));
    const meta = [item.slotName, item.type, item.itemLevel ? `ilvl ${item.itemLevel}` : ""].filter(Boolean).join(" · ");
    text.append(el("div", "gear-meta", meta));
    li.append(img, text);
    list.append(li);
  }
  section.append(list);
  return section;
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
  details.append(detail("Professions", professions.length ? professionList : "—"));

  details.append(detail("Roleset", character.role ? (gameData.roles[character.role] || character.role) : "—"));
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
