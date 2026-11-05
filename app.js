// Public homepage: renders the character list and the tip of the hour.

// The tip of the hour: the server says which one (it moves on to the next tip in the list every full hour).
async function renderTip() {
  if (LANG !== "hu") return; // Tips are written in Hungarian only; the card stays hidden.
  const card = document.getElementById("tip-card");
  const text = document.getElementById("tip-text");
  try {
    const { tips, currentId } = await fetchJson("/api/tips");
    const tip = tips.find((t) => t.id === currentId);
    card.hidden = !tip;
    if (tip) text.textContent = tip.text;
  } catch (error) {
    console.error("Failed to load tips", error); // keep whatever is shown
  }
}

async function main() {
  const tbody = document.getElementById("character-rows");
  const count = document.getElementById("count");
  renderTip();
  try {
    const gameData = await loadGameData();
    await renderCharacterTable(tbody, count, gameData);
    // The minute refresh also catches the change of hour for the tip.
    startAutoRefresh(() => {
      renderCharacterTable(tbody, count, gameData, null, { keepOnError: true });
      renderTip();
    });
  } catch (error) {
    console.error("Failed to load game data", error);
    showTableMessage(tbody, t("Nem sikerült betölteni a karaktereket."));
  }
}

main();
