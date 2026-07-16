import { createAutosave } from "../autosave-row.js";
import { openTagModal } from "../widgets/tag-modal.js";

export async function renderCatalogView({ container, schema, entityId, notebookId }) {
  container.innerHTML = "<p class='muted'>Loading…</p>";
  const view = schema.views.find((v) => v.type === "catalog" && v.entity === entityId);
  const entity = schema.entity_types[entityId];
  const table = entity?.table || entityId;

  const res = await fetch(`/api/${table}`);
  const rows = await res.json();

  let notes = [];
  if (entityId === "reference") {
    const nRes = await fetch(`/api/notes?notebook_id=${encodeURIComponent(notebookId)}`);
    notes = await nRes.json();
  }

  container.innerHTML = "";
  const toolbar = document.createElement("div");
  toolbar.className = "view-toolbar";
  const status = document.createElement("span");
  status.className = "save-status";
  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-primary";
  addBtn.textContent = `+ ${entity?.label || entityId}`;
  addBtn.addEventListener("click", async () => {
    const body = entityId === "reference"
      ? { title: "New reference", link: "https://example.com" }
      : { name: "New tag" };
    await fetch(`/api/${table}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    renderCatalogView({ container, schema, entityId, notebookId });
  });
  toolbar.append(addBtn, status);
  container.appendChild(toolbar);

  const grid = document.createElement("table");
  grid.className = "data-grid catalog-grid";
  const cols = entityId === "reference"
    ? ["title", "link", "type", "summary"]
    : ["name", "description"];
  grid.innerHTML = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Actions</th></tr></thead>`;
  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const payloads = { ...row };
    const autosave = createAutosave({
      debounceMs: 600,
      onSave: async (payload) => {
        const body = {};
        cols.forEach((c) => {
          if (payload[c] !== undefined) body[c] = payload[c];
        });
        const res = await fetch(`/api/${table}/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
      },
    });

    cols.forEach((col) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.className = "cell-input";
      input.value = row[col] || "";
      input.addEventListener("input", () => {
        payloads[col] = input.value;
        autosave.scheduleSave(payloads, status);
      });
      input.addEventListener("blur", () => autosave.scheduleSave(payloads, status));
      td.appendChild(input);
      tr.appendChild(td);
    });

    const actions = document.createElement("td");
    if (entityId === "reference") {
      const tagBtn = document.createElement("button");
      tagBtn.type = "button";
      tagBtn.className = "btn-sm";
      tagBtn.textContent = "+ Tag";
      tagBtn.addEventListener("click", async () => {
        const tRes = await fetch(`/api/references/${row.id}/tags`);
        const selected = await tRes.json();
        openTagModal({
          title: `Tag notes — ${row.title}`,
          notes: notes.map((n) => ({ ...n, notebook_id: notebookId })),
          selected,
          onSave: async (tags) => {
            await fetch(`/api/references/${row.id}/tags`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tags }),
            });
          },
        });
      });
      actions.appendChild(tagBtn);
    }
    tr.appendChild(actions);
    tbody.appendChild(tr);
  });

  grid.appendChild(tbody);
  container.appendChild(grid);
}
