// Admin page: the pool of tips shown under the list on the homepage. The server shows them in this order,
// moving on to the next one at every full hour; a countdown shows when that happens.

(function tipsAdmin() {
  const list = document.getElementById("tip-list");
  const form = document.getElementById("tip-form");
  const message = document.getElementById("tip-message");
  const countdown = document.getElementById("tip-countdown");
  const submitButton = document.getElementById("tip-submit");
  const cancelButton = document.getElementById("tip-cancel");
  if (!list || !form) return;

  let nextChangeAt = null;
  // Id of the tip being edited, or null when the form adds a new one.
  let editingId = null;

  function highlightEditedTip() {
    for (const item of list.children) {
      item.classList.toggle("editing", editingId !== null && item.dataset.id === editingId);
    }
  }

  function startEditing(tip) {
    editingId = tip.id;
    form.elements.text.value = tip.text;
    form.elements.textEn.value = tip.textEn || "";
    submitButton.textContent = "Mentés";
    cancelButton.hidden = false;
    say("");
    highlightEditedTip();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.elements.text.focus({ preventScroll: true });
  }

  function stopEditing() {
    editingId = null;
    form.reset();
    submitButton.textContent = "Tipp hozzáadása";
    cancelButton.hidden = true;
    highlightEditedTip();
  }

  cancelButton.addEventListener("click", () => {
    stopEditing();
    say("");
  });

  function say(text, kind) {
    message.textContent = text;
    message.className = `form-message ${kind || ""}`;
  }

  // "Következő tipp 23:41 múlva: …" (mm:ss), updated every second; refreshes the list when the hour turns.
  function tick() {
    if (!countdown) return;
    if (!nextChangeAt || !list.querySelector(".tip-admin-item")) {
      countdown.hidden = true;
      return;
    }
    const left = Math.max(0, Math.round((nextChangeAt - Date.now()) / 1000));
    if (left === 0) {
      nextChangeAt = null;
      refresh();
      return;
    }
    const mm = String(Math.floor(left / 60)).padStart(2, "0");
    const ss = String(left % 60).padStart(2, "0");
    const next = countdown.dataset.nextText;
    countdown.textContent = `Következő váltás ${mm}:${ss} múlva${next ? ` → ${next}` : ""}`;
    countdown.hidden = false;
  }

  async function refresh() {
    let snapshot;
    try {
      snapshot = await fetchJson("/api/tips");
    } catch (error) {
      say("Nem sikerült betölteni a tippeket.", "error");
      return;
    }
    const { tips, currentId } = snapshot;
    nextChangeAt = snapshot.nextChangeAt ? new Date(snapshot.nextChangeAt).getTime() : null;

    if (!tips.length) {
      const empty = document.createElement("li");
      empty.className = "tip-admin-empty";
      empty.textContent = "Még nincs tipp, így a főoldalon nem jelenik meg tippkártya.";
      list.replaceChildren(empty);
      tick();
      return;
    }

    const index = tips.findIndex((t) => t.id === currentId);
    const next = tips.length > 1 ? tips[(index + 1) % tips.length] : null;
    if (countdown) countdown.dataset.nextText = next ? `„${next.text.length > 60 ? `${next.text.slice(0, 57)}…` : next.text}”` : "";

    list.replaceChildren(...tips.map((tip, i) => {
      const li = document.createElement("li");
      li.className = "tip-admin-item";
      li.dataset.id = tip.id;
      const number = document.createElement("span");
      number.className = "tip-number";
      number.textContent = `${i + 1}.`;
      const text = document.createElement("span");
      text.className = "tip-admin-text";
      text.textContent = tip.text;
      if (tip.textEn) {
        const english = document.createElement("div");
        english.className = "tip-admin-english";
        english.textContent = `EN: ${tip.textEn}`;
        text.append(english);
      }
      li.append(number, text);
      if (tip.id === currentId) {
        const now = document.createElement("span");
        now.className = "tip-now";
        now.textContent = "most látható";
        li.append(now);
      } else if (next && tip.id === next.id) {
        const soon = document.createElement("span");
        soon.className = "tip-next";
        soon.textContent = "következő";
        li.append(soon);
      }
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-button";
      edit.textContent = "Szerkesztés";
      edit.addEventListener("click", () => startEditing(tip));
      li.append(edit);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "edit-button delete-button";
      remove.textContent = "Törlés";
      remove.addEventListener("click", async () => {
        if (!confirm(`Biztosan törlöd ezt a tippet?\n\n${tip.text}`)) return;
        try {
          await fetchJson(`/admin/api/tips/${encodeURIComponent(tip.id)}`, { method: "DELETE" });
          if (editingId === tip.id) stopEditing();
          say("Tipp törölve.", "success");
        } catch (error) {
          say(error.message || "Nem sikerült a törlés.", "error");
        }
        refresh();
      });
      li.append(remove);
      return li;
    }));
    highlightEditedTip();
    tick();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = form.elements.text.value.trim();
    const textEn = form.elements.textEn.value.trim();
    if (!text) {
      say("A tipp szövege nem lehet üres.", "error");
      return;
    }
    const isEdit = editingId !== null;
    submitButton.disabled = true;
    try {
      await fetchJson(isEdit ? `/admin/api/tips/${encodeURIComponent(editingId)}` : "/admin/api/tips", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, textEn }),
      });
      stopEditing();
      say(isEdit ? "Tipp mentve." : "Tipp hozzáadva a lista végére.", "success");
      refresh();
    } catch (error) {
      say(error.message || "Nem sikerült a mentés.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  refresh();
  setInterval(tick, 1000);
})();
