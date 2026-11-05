// Admin page: the pool of tips shown under the list on the homepage (one per hour, in this order).

(function tipsAdmin() {
  const list = document.getElementById("tip-list");
  const form = document.getElementById("tip-form");
  const message = document.getElementById("tip-message");
  if (!list || !form) return;

  function say(text, kind) {
    message.textContent = text;
    message.className = `form-message ${kind || ""}`;
  }

  async function refresh() {
    let tips;
    try {
      tips = await fetchJson("/api/tips");
    } catch (error) {
      say("Nem sikerült betölteni a tippeket.", "error");
      return;
    }
    const current = tips.length ? tips[Math.floor(Date.now() / 3_600_000) % tips.length].id : null;
    if (!tips.length) {
      const empty = document.createElement("li");
      empty.className = "tip-admin-empty";
      empty.textContent = "Még nincs tipp, így a főoldalon nem jelenik meg tippkártya.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...tips.map((tip) => {
      const li = document.createElement("li");
      li.className = "tip-admin-item";
      const text = document.createElement("span");
      text.className = "tip-admin-text";
      text.textContent = tip.text;
      li.append(text);
      if (tip.id === current) {
        const now = document.createElement("span");
        now.className = "tip-now";
        now.textContent = "most látható";
        li.append(now);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "edit-button delete-button";
      remove.textContent = "Törlés";
      remove.addEventListener("click", async () => {
        if (!confirm(`Biztosan törlöd ezt a tippet?\n\n${tip.text}`)) return;
        try {
          await fetchJson(`/admin/api/tips/${encodeURIComponent(tip.id)}`, { method: "DELETE" });
          say("Tipp törölve.", "success");
        } catch (error) {
          say(error.message || "Nem sikerült a törlés.", "error");
        }
        refresh();
      });
      li.append(remove);
      return li;
    }));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) {
      say("A tipp szövege nem lehet üres.", "error");
      return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await fetchJson("/admin/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      form.reset();
      say("Tipp hozzáadva.", "success");
      refresh();
    } catch (error) {
      say(error.message || "Nem sikerült a mentés.", "error");
    } finally {
      button.disabled = false;
    }
  });

  refresh();
})();
