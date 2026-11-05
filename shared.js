// Helpers shared by the public list and the admin page.

async function fetchJson(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((body && body.error) || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function loadGameData() {
  return fetchJson("/game-data.json");
}

function loadCharacters() {
  return fetchJson("/api/characters");
}

function sortCharacters(characters) {
  return characters.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "hu"));
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

// An icon with its English name shown as a tooltip on hover.
function iconCell(src, name) {
  const td = document.createElement("td");
  const wrapper = document.createElement("span");
  wrapper.className = "icon";
  wrapper.dataset.tooltip = name;
  const img = document.createElement("img");
  img.src = src;
  img.alt = name;
  img.width = 28;
  img.height = 28;
  wrapper.append(img);
  td.append(wrapper);
  return td;
}

function renderCharacterRow(character, gameData) {
  const cls = gameData.classes[character.class] || { name: character.class, color: null };
  const raceName = gameData.races[character.race] || character.race;
  const gender = character.gender === "female" ? "female" : "male";
  const tr = document.createElement("tr");
  if (cls.color) tr.style.setProperty("--class-color", cls.color);

  tr.append(
    cell(`${character.name} ${character.surname}`, "name"),
    iconCell(`/icons/class/${character.class}.jpg`, cls.name),
    cell(String(character.level), "num"),
    iconCell(`/icons/race/${character.race}_${gender}.jpg`, raceName),
  );

  const roleTd = document.createElement("td");
  const role = document.createElement("span");
  role.className = `role role-${character.role}`;
  role.textContent = gameData.roles[character.role] || character.role;
  roleTd.append(role);
  tr.append(roleTd);

  return tr;
}

function showTableMessage(tbody, text) {
  const td = cell(text, "empty");
  td.colSpan = 5;
  const tr = document.createElement("tr");
  tr.append(td);
  tbody.replaceChildren(tr);
}

// Fills the character table and the count label; returns the loaded characters.
async function renderCharacterTable(tbody, countEl, gameData) {
  try {
    const characters = sortCharacters(await loadCharacters());
    if (characters.length === 0) {
      showTableMessage(tbody, "Még nincs karakter a listán.");
    } else {
      tbody.replaceChildren(...characters.map((c) => renderCharacterRow(c, gameData)));
    }
    countEl.textContent = `${characters.length} karakter`;
    return characters;
  } catch (error) {
    console.error("Failed to load characters", error);
    showTableMessage(tbody, "Nem sikerült betölteni a karaktereket.");
    return [];
  }
}
