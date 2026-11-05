// Languages of the public pages: Hungarian (default) and English. Loaded in <head>, before everything else.
//
// The Hungarian text in the code and the HTML is the source; t() looks up its English version here and falls
// back to the Hungarian text if there is none. In HTML, mark an element with data-i18n (its text is translated)
// or data-i18n-aria (its aria-label is translated). The choice is kept in localStorage ("lang").
// The admin area is Hungarian only.

const LANGUAGES = {
  hu: { short: "HU", name: "Magyar" },
  en: { short: "EN", name: "English" },
};

const LANG = (() => {
  if (location.pathname.startsWith("/admin")) return "hu";
  try {
    return localStorage.getItem("lang") === "en" ? "en" : "hu";
  } catch {
    return "hu";
  }
})();

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const ENGLISH = {
  // Page titles
  "Imbul Forever – karakterek": "Imbul Forever – characters",
  "Imbul Forever – karakter": "Imbul Forever – character",
  "Magyarítás – Imbul Forever": "Hungarian translation – Imbul Forever",

  // Header
  "Oldalak": "Pages",
  "Lista oldal": "Character list",
  "Magyarítás": "Hungarian translation",
  "Nyelv": "Language",
  "Sötét": "Dark",
  "Világos": "Light",
  "Karácsonyi": "Christmas",
  "Megjelenés": "Appearance",
  "{name} téma": "{name} theme",

  // Character list
  "Karakterek": "Characters",
  "{n} karakter": ({ n }) => plural(n, "character", "characters"),
  "Infó a Blizzard adatokról": "About the Blizzard data",
  "A Blizzard API csak a legalább 10-es szintű karaktereket adja vissza, és egy karakter adatai csak akkor frissülnek, amikor kilép a játékból.":
    "The Blizzard API only returns characters of level 10 or higher, and a character's data only updates when they log out of the game.",
  "Név": "Name",
  "Kié": "Owner",
  "Frakció": "Faction",
  "Kaszt": "Class",
  "Szint": "Level",
  "Faj": "Race",
  "Szakmák": "Professions",
  "Játékmód": "Ruleset",
  "Utoljára frissült": "Last updated",
  "Betöltés…": "Loading…",
  "Még nincs karakter a listán.": "There are no characters on the list yet.",
  "Nem sikerült betölteni a karaktereket.": "Could not load the characters.",

  // Relative times
  "épp most": "just now",
  "{n} perce": ({ n }) => `${plural(n, "minute", "minutes")} ago`,
  "{n} órája": ({ n }) => `${plural(n, "hour", "hours")} ago`,
  "tegnap": "yesterday",
  "{n} napja": ({ n }) => `${plural(n, "day", "days")} ago`,
  "{n} hete": ({ n }) => `${plural(n, "week", "weeks")} ago`,
  "{n} hónapja": ({ n }) => `${plural(n, "month", "months")} ago`,
  "{n} éve": ({ n }) => `${plural(n, "year", "years")} ago`,

  // Footer and new-version dialog
  "kiadva": "released",
  "✨ Frissült az oldal": "✨ The site has been updated",
  "Megjelent az Imbul Forever új verziója (v{version}). Töltsd újra az oldalt, hogy a legfrissebb változatot lásd, és minden rendben működjön.":
    "A new version of Imbul Forever is out (v{version}). Reload the page to see the latest version and keep everything working properly.",
  "Később": "Later",
  "Újratöltés": "Reload",

  // Character page
  "Utolsó belépés": "Last login",
  "Felszerelés": "Gear",
  "A felszerelés csak a Blizzard által ismert karaktereknél látszik: legalább 10-es szint, és a karakter azóta kilépett a játékból.":
    "Gear is only shown for characters Blizzard knows about: level 10 or higher, and logged out of the game since the API launched.",
  "Ez a karakter nincs a listán.": "This character is not on the list.",
  "Nem sikerült betölteni a karaktert.": "Could not load the character.",
  "Kiemelkedő: jóval a szintje fölötti felszerelés": "Outstanding: gear well above their level",
  "Kiváló: bőven a szintje fölötti felszerelés": "Excellent: gear far above their level",
  "Jó: dungeon-szintű felszerelés": "Good: dungeon-level gear",
  "Rendben: a szintjének megfelelő felszerelés": "Fine: gear that matches their level",
  "Lemaradt: a szintjénél gyengébb felszerelés": "Behind: gear below their level",
  "Kiemelkedő: tier 2 (Blackwing Lair) szint és fölötte": "Outstanding: tier 2 (Blackwing Lair) level and above",
  "Raid szint: Molten Core (tier 1) felszerelés": "Raid level: Molten Core (tier 1) gear",
  "Pre-raid: dungeon blue felszerelés": "Pre-raid: dungeon blue gear",
  "Kezdő 60-as: quest és dungeon green felszerelés": "Fresh 60: quest and dungeon green gear",
  "Szintlépés közbeni felszerelés": "Levelling gear",

  // Hungarian translation page
  "Magyar szöveg és magyar szinkron a WoW: Foreverhez, három addonnal.":
    "Hungarian text and Hungarian voice-over for WoW: Forever, with three addons.",
  "Mindhárom addont kézzel töltsd le, és telepítsd a": "Download all three addons manually and install them in the",
  "mappába, majd indítsd újra a játékot. A CurseForge-os telepítés jelenleg nem működik.":
    "folder, then restart the game. Installing through CurseForge does not work at the moment.",
  "Magyar fordítás: questek, NPC-szövegek, átvezetők feliratai, könyvek és tooltipek magyarul.":
    "Hungarian translation: quests, NPC text, cutscene subtitles, books and tooltips in Hungarian.",
  "A magyar szinkron alapcsomagja (AI-hangok). A World of Huncraft fordítással együtt működik a legjobban.":
    "The base package of the Hungarian voice-over (AI voices). Works best together with the World of Huncraft translation.",
  "Magyar hang a questekhez, NPC-beszélgetésekhez, a mesélőhöz és az átvezetőkhöz.":
    "Hungarian voices for quests, NPC conversations, the narrator and cutscenes.",
  "Készítő:": "Author:",
  "Letöltés ↗": "Download ↗",
};

// The text in the current language; {name} placeholders are filled from vars.
function t(text, vars = {}) {
  const entry = LANG === "en" ? ENGLISH[text] : undefined;
  const result = typeof entry === "function" ? entry(vars) : entry ?? text;
  return result.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

// The language switch of the header; choosing a language reloads the page in it.
function renderLanguageControl() {
  const group = document.createElement("div");
  group.className = "theme-switch language-control";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", t("Nyelv"));
  for (const [lang, { short, name }] of Object.entries(LANGUAGES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.lang = lang;
    button.title = name;
    button.textContent = short;
    button.setAttribute("aria-pressed", String(lang === LANG));
    button.addEventListener("click", () => {
      if (lang === LANG) return;
      try {
        localStorage.setItem("lang", lang);
      } catch { /* private mode: the choice can't be kept */ }
      location.reload();
    });
    group.append(button);
  }
  return group;
}

document.documentElement.lang = LANG;

if (LANG !== "hu") {
  document.addEventListener("DOMContentLoaded", () => {
    document.title = t(document.title);
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.textContent.trim()); });
    document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("aria-label")));
    });
  });
}
