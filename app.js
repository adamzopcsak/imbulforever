// Public homepage: renders the character list.

async function main() {
  const tbody = document.getElementById("character-rows");
  const count = document.getElementById("count");
  try {
    const gameData = await loadGameData();
    await renderCharacterTable(tbody, count, gameData);
    startAutoRefresh(() => renderCharacterTable(tbody, count, gameData, null, { keepOnError: true }));
  } catch (error) {
    console.error("Failed to load game data", error);
    showTableMessage(tbody, "Nem sikerült betölteni a karaktereket.");
  }
}

main();
