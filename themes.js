// Themes: dark (default), light, and seasonal themes that are the default in their season.
// Loaded in <head> so the right theme is set before the page is drawn.
//
// - Outside a season a button switches between dark and light; the choice is kept in localStorage ("theme").
// - In a season its theme is the default, and a three-way switch (seasonal / dark / light) replaces the button.
//   Leaving the seasonal theme is remembered for that season of that year only ("seasonOff" = "christmas-2026"),
//   so next year it is the default again.
// - For trying a seasonal theme outside its season: open any page with ?tema=christmas (kept for the browser tab);
//   ?tema=off ends it.

const SEASONS = {
  christmas: {
    label: "Karácsonyi",
    icon: "🎄",
    start: [12, 24], // month, day; both days included
    end: [12, 30],
    rule: "Minden évben december 24–30.",
  },
};

const PLAIN_THEMES = {
  dark: { label: "Sötét", icon: "🌙" },
  light: { label: "Világos", icon: "☀️" },
};

// Today's date in Budapest as { year, month, day }.
function budapestToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date()).map((p) => [p.type, Number(p.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

// First and last day of a season in the given year, as Date objects (UTC midnight, for day arithmetic).
function seasonSpan(season, year) {
  const endYear = season.end[0] < season.start[0] ? year + 1 : year; // a season may run over the new year
  return {
    start: new Date(Date.UTC(year, season.start[0] - 1, season.start[1])),
    end: new Date(Date.UTC(endYear, season.end[0] - 1, season.end[1])),
  };
}

function todayUtcDate() {
  const t = budapestToday();
  return new Date(Date.UTC(t.year, t.month - 1, t.day));
}

// The season on today as { key, year }, or null. ?tema=<key> forces one (see above).
function currentSeason() {
  const forced = sessionStorage.getItem("forceSeason");
  if (forced && SEASONS[forced]) return { key: forced, year: budapestToday().year, forced: true };
  const today = todayUtcDate();
  for (const [key, season] of Object.entries(SEASONS)) {
    for (const year of [today.getUTCFullYear(), today.getUTCFullYear() - 1]) {
      const { start, end } = seasonSpan(season, year);
      if (start <= today && today <= end) return { key, year };
    }
  }
  return null;
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: the choice just isn't remembered */ }
}

// The theme to show now: "dark", "light" or a season key.
function currentThemeMode(season) {
  const base = readStorage("theme") === "light" ? "light" : "dark";
  if (season && readStorage("seasonOff") !== `${season.key}-${season.year}`) return season.key;
  return base;
}

function applyTheme(mode, season) {
  const root = document.documentElement;
  if (season && mode === season.key) {
    root.dataset.season = season.key;
    root.dataset.theme = "dark";
  } else {
    delete root.dataset.season;
    root.dataset.theme = mode;
  }
}

function setThemeMode(mode, season) {
  if (season && mode === season.key) {
    writeStorage("seasonOff", null);
  } else {
    writeStorage("theme", mode);
    if (season) writeStorage("seasonOff", `${season.key}-${season.year}`);
  }
  applyTheme(mode, season);
}

// ?tema=christmas / ?tema=off
(function handleForcedSeason() {
  const param = new URLSearchParams(location.search).get("tema");
  if (param === "off") sessionStorage.removeItem("forceSeason");
  else if (param && SEASONS[param]) sessionStorage.setItem("forceSeason", param);
})();

const ACTIVE_SEASON = currentSeason();
applyTheme(currentThemeMode(ACTIVE_SEASON), ACTIVE_SEASON);

// The theme control: a dark/light button, or in a season a three-way switch.
function renderThemeControl() {
  const season = ACTIVE_SEASON;
  const control = document.createElement("div");
  control.className = "theme-control";

  if (!season) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    const label = () => (document.documentElement.dataset.theme === "light" ? "🌙 Sötét" : "☀️ Világos");
    button.textContent = label();
    button.addEventListener("click", () => {
      setThemeMode(document.documentElement.dataset.theme === "light" ? "dark" : "light", null);
      button.textContent = label();
    });
    control.append(button);
    return control;
  }

  const group = document.createElement("div");
  group.className = "theme-switch";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Megjelenés");
  const options = [[season.key, SEASONS[season.key]], ["dark", PLAIN_THEMES.dark], ["light", PLAIN_THEMES.light]];
  const current = currentThemeMode(season);
  for (const [mode, look] of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = `${look.label} téma`;
    button.setAttribute("aria-pressed", String(mode === current));
    button.append(look.icon);
    const text = document.createElement("span");
    text.className = "theme-switch-label";
    text.textContent = ` ${look.label}`;
    button.append(text);
    button.addEventListener("click", () => {
      setThemeMode(mode, season);
      group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    });
    group.append(button);
  }
  control.append(group);
  return control;
}

// Snow for the Christmas theme: a few slow flakes behind the content. Made for the whole season;
// CSS shows them only while the Christmas theme is on, so switching needs no reload.
function addSnow() {
  const snow = document.createElement("div");
  snow.className = "snow";
  snow.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 30; i++) {
    const flake = document.createElement("i");
    const size = 1.5 + Math.random() * 2;
    const duration = 16 + Math.random() * 16;
    flake.style.cssText = `left:${(Math.random() * 100).toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;`
      + `opacity:${(0.2 + Math.random() * 0.4).toFixed(2)};animation-duration:${duration.toFixed(1)}s;`
      + `animation-delay:-${(Math.random() * duration).toFixed(1)}s;--sway:${(Math.random() * 40 - 20).toFixed(0)}px`;
    snow.append(flake);
  }
  document.body.append(snow);
}

document.addEventListener("DOMContentLoaded", () => {
  // Put the theme control in the header: before the "back"/admin link.
  const header = document.querySelector(".site-header, .admin-header");
  if (header) {
    const anchor = header.querySelector(".back, .admin-button");
    const control = renderThemeControl();
    if (anchor) anchor.before(control);
    else header.append(control);
  }
  if (ACTIVE_SEASON && ACTIVE_SEASON.key === "christmas") addSnow();
});
