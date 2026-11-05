// Admin page: add characters and see the current list.

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
  const message = document.getElementById("form-message");
  const tbody = document.getElementById("character-rows");
  const count = document.getElementById("count");

  let gameData;
  try {
    gameData = await loadGameData();
  } catch (error) {
    console.error("Failed to load game data", error);
    setMessage(message, "Nem sikerült betölteni az adatokat.", "error");
    return;
  }

  fillSelect(form.elements.class, Object.entries(gameData.classes).map(([key, c]) => [key, c.label]));
  fillSelect(form.elements.race, Object.entries(gameData.races));
  fillSelect(form.elements.role, Object.entries(gameData.roles));
  form.elements.level.max = gameData.maxLevel;

  await renderCharacterTable(tbody, count, gameData);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = form.elements;
    const character = {
      name: fields.name.value.trim(),
      surname: fields.surname.value.trim(),
      class: fields.class.value,
      level: Number(fields.level.value),
      race: fields.race.value,
      role: fields.role.value,
    };

    if (!character.name || !character.surname) {
      setMessage(message, "A név és a vezetéknév megadása kötelező.", "error");
      return;
    }

    const button = form.querySelector("button");
    button.disabled = true;
    setMessage(message, "Mentés…");
    try {
      await fetchJson("/admin/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(character),
      });
      setMessage(message, `${character.name} ${character.surname} hozzáadva.`, "success");
      fields.name.value = "";
      fields.surname.value = "";
      fields.name.focus();
      await renderCharacterTable(tbody, count, gameData);
    } catch (error) {
      setMessage(message, error.message || "Nem sikerült a mentés.", "error");
    } finally {
      button.disabled = false;
    }
  });
}

main();
