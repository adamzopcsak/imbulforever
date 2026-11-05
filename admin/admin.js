// Admin page: add and edit characters, and see the current list.

function fillSelect(select, entries) {
  select.replaceChildren(
    ...entries.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
}

function setMessage(el, text, kind) {
  el.textContent = text;
  el.className = `form-message ${kind || ""}`;
}

async function main() {
  const form = document.getElementById("character-form");
  const formTitle = document.getElementById("form-title");
  const submitButton = document.getElementById("submit-button");
  const cancelButton = document.getElementById("cancel-button");
  const message = document.getElementById("form-message");
  const tbody = document.getElementById("character-rows");
  const count = document.getElementById("count");
  const fields = form.elements;
  const syncNote = document.getElementById("sync-note");

  // Id of the character being edited, or null when the form adds a new one.
  let editingId = null;

  let gameData;
  try {
    gameData = await loadGameData();
  } catch (error) {
    console.error("Failed to load game data", error);
    setMessage(message, "Nem sikerült betölteni az adatokat.", "error");
    return;
  }

  fillSelect(fields.class, Object.entries(gameData.classes).map(([key, c]) => [key, c.name]));
  fillSelect(fields.race, Object.entries(gameData.races));
  fillSelect(fields.gender, Object.entries(gameData.genders));
  fillSelect(fields.faction, Object.entries(gameData.factions));
  // The roleset is optional, so the first option is empty.
  fillSelect(fields.role, [["", "—"], ...Object.entries(gameData.roles)]);
  fields.level.max = gameData.maxLevel;

  // Profession checkboxes, shown as icons with the English name on hover.
  const professionOptions = document.getElementById("profession-options");
  for (const [key, profession] of Object.entries(gameData.professions)) {
    const label = document.createElement("label");
    label.className = "profession-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "professions";
    checkbox.value = key;
    checkbox.setAttribute("aria-label", profession.name);
    label.append(checkbox, icon(`/icons/profession/${key}.jpg`, profession.name));
    professionOptions.append(label);
  }
  const professionBoxes = [...professionOptions.querySelectorAll("input")];
  const isPrimary = (box) => gameData.professions[box.value].type === "primary";

  professionOptions.addEventListener("change", (event) => {
    const box = event.target;
    const checkedPrimary = professionBoxes.filter((b) => b.checked && isPrimary(b));
    if (box.checked && isPrimary(box) && checkedPrimary.length > gameData.maxPrimaryProfessions) {
      box.checked = false;
      setMessage(message, `Legfeljebb ${gameData.maxPrimaryProfessions} fő szakma választható.`, "error");
    }
  });

  function highlightEditedRow() {
    for (const row of tbody.rows) {
      row.classList.toggle("editing", editingId !== null && row.dataset.id === editingId);
    }
  }

  function startEditing(character) {
    editingId = character.id;
    fields.name.value = character.name;
    fields.surname.value = character.surname;
    fields.owner.value = character.owner || "";
    fields.class.value = character.class;
    fields.level.value = character.level;
    fields.race.value = character.race;
    fields.gender.value = character.gender || "male";
    fields.faction.value = character.faction || "alliance";
    fields.role.value = character.role || "";
    const professions = character.professions || [];
    for (const box of professionBoxes) box.checked = professions.includes(box.value);
    formTitle.textContent = `${character.name} ${character.surname} szerkesztése`;
    syncNote.hidden = !character.blizzard;
    submitButton.textContent = "Mentés";
    cancelButton.hidden = false;
    setMessage(message, "");
    highlightEditedRow();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    fields.name.focus({ preventScroll: true });
  }

  function stopEditing() {
    editingId = null;
    form.reset();
    formTitle.textContent = "Új karakter";
    syncNote.hidden = true;
    submitButton.textContent = "Hozzáadás";
    cancelButton.hidden = true;
    highlightEditedRow();
  }

  async function deleteCharacter(character) {
    const fullName = `${character.name} ${character.surname}`;
    if (!confirm(`Biztosan törlöd: ${fullName}?`)) return;
    try {
      await fetchJson(`/admin/api/characters/${encodeURIComponent(character.id)}`, { method: "DELETE" });
      if (editingId === character.id) stopEditing();
      setMessage(message, `${fullName} törölve.`, "success");
    } catch (error) {
      setMessage(message, error.message || "Nem sikerült a törlés.", "error");
    }
    await refreshTable();
  }

  function actionButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  // Characters found in the Blizzard API get a badge; their game data is overwritten by the sync.
  function markBlizzardRows() {
    for (const row of tbody.rows) {
      const character = charactersById.get(row.dataset.id);
      if (!character || !character.blizzard || row.querySelector(".source-badge")) continue;
      const badge = document.createElement("span");
      badge.className = "source-badge tooltip";
      badge.dataset.tooltip = "Az adatok a Blizzard API-ból frissülnek";
      badge.textContent = "Blizzard";
      row.cells[0].append(" ", badge);
    }
  }

  function renderActions(character) {
    const td = document.createElement("td");
    td.className = "actions";
    td.append(
      actionButton("Szerkesztés", "edit-button", () => startEditing(character)),
      actionButton("Törlés", "edit-button delete-button", () => deleteCharacter(character)),
    );
    return td;
  }

  let charactersById = new Map();

  async function refreshTable(options) {
    const characters = await renderCharacterTable(tbody, count, gameData, renderActions, options);
    if (characters.length) charactersById = new Map(characters.map((c) => [c.id, c]));
    markBlizzardRows();
    highlightEditedRow();
  }

  await refreshTable();
  // Background refresh: keeps the list and the "Frissítve" times current; the form is not touched.
  startAutoRefresh(() => refreshTable({ keepOnError: true }));

  cancelButton.addEventListener("click", () => {
    stopEditing();
    setMessage(message, "");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const character = {
      name: fields.name.value.trim(),
      surname: fields.surname.value.trim(),
      owner: fields.owner.value.trim(),
      class: fields.class.value,
      level: Number(fields.level.value),
      race: fields.race.value,
      gender: fields.gender.value,
      faction: fields.faction.value,
      role: fields.role.value,
      professions: professionBoxes.filter((b) => b.checked).map((b) => b.value),
    };

    if (!character.name || !character.surname) {
      setMessage(message, "A név és a vezetéknév megadása kötelező.", "error");
      return;
    }

    const isEdit = editingId !== null;
    submitButton.disabled = true;
    setMessage(message, "Mentés…");
    try {
      await fetchJson(isEdit ? `/admin/api/characters/${encodeURIComponent(editingId)}` : "/admin/api/characters", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(character),
      });
      const fullName = `${character.name} ${character.surname}`;
      setMessage(message, isEdit ? `${fullName} mentve.` : `${fullName} hozzáadva.`, "success");
      stopEditing();
      fields.name.focus();
      await refreshTable();
    } catch (error) {
      setMessage(message, error.message || "Nem sikerült a mentés.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

main();
