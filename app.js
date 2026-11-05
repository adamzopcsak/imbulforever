// Renders the character list from characters.json.

// Hungarian display names and the standard WoW class colors.
const CLASSES = {
  warrior: { label: "Harcos", color: "#C69B6D" },
  paladin: { label: "Paladin", color: "#F48CBA" },
  hunter: { label: "Vadász", color: "#AAD372" },
  rogue: { label: "Zsivány", color: "#FFF468" },
  priest: { label: "Pap", color: "#FFFFFF" },
  shaman: { label: "Sámán", color: "#0070DD" },
  mage: { label: "Mágus", color: "#3FC7EB" },
  warlock: { label: "Boszorkánymester", color: "#8788EE" },
  druid: { label: "Druida", color: "#FF7C0A" },
};

const RACES = {
  human: "Ember",
  dwarf: "Törpe",
  nightelf: "Éjtünde",
  gnome: "Gnóm",
  orc: "Ork",
  undead: "Élőhalott",
  tauren: "Tauren",
  troll: "Troll",
  skyborne: "Skyborne",
};

const ROLES = {
  pvp: "PvP",
  pve: "PvE",
};

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderRow(character) {
  const cls = CLASSES[character.class] || { label: character.class, color: null };
  const tr = document.createElement("tr");
  if (cls.color) tr.style.setProperty("--class-color", cls.color);

  tr.append(
    cell(`${character.name} ${character.surname}`, "name"),
    cell(cls.label, "class-name"),
    cell(String(character.level), "num"),
    cell(RACES[character.race] || character.race),
  );

  const roleTd = document.createElement("td");
  const role = document.createElement("span");
  role.className = `role role-${character.role}`;
  role.textContent = ROLES[character.role] || character.role;
  roleTd.append(role);
  tr.append(roleTd);

  return tr;
}

function showMessage(tbody, text) {
  tbody.replaceChildren();
  const tr = document.createElement("tr");
  tr.append(cell(text, "empty"));
  tr.firstChild.colSpan = 5;
  tbody.append(tr);
}

async function main() {
  const tbody = document.getElementById("character-rows");
  const count = document.getElementById("count");

  try {
    const response = await fetch("characters.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const characters = await response.json();

    characters.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "hu"));

    if (characters.length === 0) {
      showMessage(tbody, "Még nincs karakter a listán.");
    } else {
      tbody.replaceChildren(...characters.map(renderRow));
    }
    count.textContent = `${characters.length} karakter`;
  } catch (error) {
    console.error("Failed to load characters.json", error);
    showMessage(tbody, "Nem sikerült betölteni a karaktereket.");
  }
}

main();
