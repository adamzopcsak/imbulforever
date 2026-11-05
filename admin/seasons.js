// Admin page: the seasonal themes (SEASONS in /themes.js), when each is on, and whether it is on now.

(function renderSeasons() {
  const tbody = document.getElementById("season-rows");
  if (!tbody) return;

  const DAY = 24 * 60 * 60 * 1000;
  const monthNames = ["január", "február", "március", "április", "május", "június",
    "július", "augusztus", "szeptember", "október", "november", "december"];
  const day = (date, withYear) =>
    `${withYear ? `${date.getUTCFullYear()}. ` : ""}${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}.`;

  const today = todayUtcDate();
  const year = today.getUTCFullYear();
  const forced = sessionStorage.getItem("forceSeason");

  const rows = Object.entries(SEASONS).map(([key, season]) => {
    const current = [year - 1, year].map((y) => seasonSpan(season, y)).find((s) => s.start <= today && today <= s.end);
    const span = current || [year, year + 1].map((y) => seasonSpan(season, y)).find((s) => s.start > today);
    let status;
    if (current) {
      const left = Math.round((span.end - today) / DAY);
      status = left === 0 ? "Most aktív, ma az utolsó nap" : `Most aktív, még ${left + 1} napig`;
    } else {
      const days = Math.round((span.start - today) / DAY);
      status = days === 1 ? "Holnap kezdődik" : `${days} nap múlva kezdődik`;
    }
    if (forced === key) status += " · ebben a böngészőfülben most kipróbálásra bekapcsolva";
    return { key, season, span, status, active: Boolean(current) || forced === key };
  });

  tbody.replaceChildren(...rows.map(({ season, span, status, active }) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = `${season.icon} ${season.label}`;
    const rule = document.createElement("td");
    rule.className = "muted";
    rule.textContent = season.rule;
    const when = document.createElement("td");
    when.textContent = `${day(span.start, true)} – ${day(span.end, span.end.getUTCFullYear() !== span.start.getUTCFullYear())}`;
    const note = document.createElement("div");
    note.className = `theme-status${active ? " on" : ""}`;
    note.textContent = status;
    when.append(note);
    tr.append(name, rule, when);
    return tr;
  }));
})();
