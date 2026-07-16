import { createAutosave } from "../autosave-row.js";
import {
  renderBoxStack,
  renderBulletEditor,
  renderTextInput,
} from "../widgets/field-renderers.js";
import { openThemeModal } from "../widgets/tag-modal.js";

export async function renderGridView({
  container,
  schema,
  notebookId,
}) {
  container.innerHTML = "<p class='muted'>Loading notes…</p>";
  try {
    const view = schema.views.find((v) => v.type === "grid");
    const columns = view?.columns_from_fields || ["title", "body", "references"];
    const entity = schema.entity_types[view?.entity || "note"];
    const fields = entity?.fields || {};

    const [notesRes, tagsRes] = await Promise.all([
      fetch(`/api/notes?notebook_id=${encodeURIComponent(notebookId)}`),
      fetch("/api/tags"),
    ]);
    if (!notesRes.ok) throw new Error(`Notes API: HTTP ${notesRes.status}`);
    if (!tagsRes.ok) throw new Error(`Tags API: HTTP ${tagsRes.status}`);
    const notes = await notesRes.json();
    const tags = await tagsRes.json();
    if (!Array.isArray(notes)) throw new Error("Unexpected notes response");

    container.innerHTML = "";
  const toolbar = document.createElement("div");
  toolbar.className = "view-toolbar";
  const status = document.createElement("span");
  status.className = "save-status";
  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-primary";
  addBtn.textContent = "+ Note";
  addBtn.addEventListener("click", async () => {
    await fetch(`/api/notes?notebook_id=${encodeURIComponent(notebookId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New note", status: "draft" }),
    });
    renderGridView({ container, schema, notebookId });
  });
  toolbar.append(addBtn, status);
  container.appendChild(toolbar);

  const table = document.createElement("table");
  table.className = "data-grid";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = "<th>#</th>" + columns.map((c) => `<th>${fields[c]?.editor?.header || c}</th>`).join("") + "<th>Tags</th><th></th>";
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  notes.forEach((note) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="row-id">${note.id}</td>`;
    const payloads = { ...note };

    const autosave = createAutosave({
      debounceMs: 600,
      onSave: async (payload) => {
        const body = {};
        columns.forEach((c) => {
          if (payload[c] !== undefined) body[c] = payload[c];
        });
        const res = await fetch(
          `/api/notes/${note.id}?notebook_id=${encodeURIComponent(notebookId)}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        );
        if (!res.ok) throw new Error(await res.text());
      },
    });

    columns.forEach((col) => {
      const td = document.createElement("td");
      const fdef = fields[col] || {};
      const onChange = (val) => {
        payloads[col] = val;
        autosave.scheduleSave(payloads, status);
      };
      if (fdef.type === "bullet_list") {
        td.appendChild(renderBulletEditor(note[col], onChange));
      } else if (fdef.editor?.widget === "box_stack" || fdef.type === "multiline_text") {
        td.appendChild(renderBoxStack(note[col], onChange));
      } else {
        td.appendChild(renderTextInput(note[col], onChange));
      }
      tr.appendChild(td);
    });

    const tagsTd = document.createElement("td");
    const pills = document.createElement("span");
    pills.className = "theme-pills";
    pills.textContent = (note.tags || []).join(", ") || "—";
    const editTags = document.createElement("button");
    editTags.type = "button";
    editTags.className = "btn-sm";
    editTags.textContent = "Edit tags";
    editTags.addEventListener("click", () => {
      const selected = tags.filter((t) => (note.tags || []).includes(t.name)).map((t) => t.id);
      openThemeModal({
        title: `Tags for note #${note.id}`,
        tags,
        selectedIds: selected,
        onSave: async (tag_ids) => {
          await fetch(
            `/api/notes/${note.id}/tags?notebook_id=${encodeURIComponent(notebookId)}`,
            { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag_ids }) }
          );
          renderGridView({ container, schema, notebookId });
        },
      });
    });
    tagsTd.append(pills, " ", editTags);
    tr.appendChild(tagsTd);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  } catch (err) {
    container.innerHTML = `<p class="status error">Failed to load notes: ${err.message}</p>`;
  }
}
