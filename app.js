// Public homepage: renders the character list and the tip of the hour.

// The tip shown this hour: every visitor sees the same one, and it moves on to the next tip each hour.
// (Budapest is a whole number of hours off UTC, so UTC hours change together with local ones.)
function tipOfTheHour(tips) {
  if (!tips.length) return null;
  const hour = Math.floor(Date.now() / 3_600_000);
  return tips[hour % tips.length];
}

async function renderTip() {
  const card = document.getElementById("tip-card");
  const text = document.getElementById("tip-text");
  try {
    const tip = tipOfTheHour(await fetchJson("/api/tips"));
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
    showTableMessage(tbody, "Nem sikerült betölteni a karaktereket.");
  }
}

main();
