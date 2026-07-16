/** Tag modal — pick notes to link a catalog entry to. */
export function openTagModal({ title, notes, selected, onSave }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h3>${title}</h3>`;
  const list = document.createElement("div");
  list.className = "modal-list";

  const selectedKeys = new Set(
    (selected || []).map((t) => `${t.notebook_id}:${t.note_id}`)
  );

  notes.forEach((n) => {
    const key = `${n.notebook_id}:${n.id}`;
    const label = document.createElement("label");
    label.className = "modal-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedKeys.has(key);
    cb.dataset.notebookId = n.notebook_id;
    cb.dataset.noteId = n.id;
    label.appendChild(cb);
    label.append(` #${n.id} — ${n.title}`);
    list.appendChild(label);
  });
  modal.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancel = document.createElement("button");
  cancel.className = "btn";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => overlay.remove());
  const save = document.createElement("button");
  save.className = "btn btn-primary";
  save.textContent = "Save";
  save.addEventListener("click", async () => {
    const tags = [...list.querySelectorAll("input:checked")].map((cb) => ({
      notebook_id: cb.dataset.notebookId,
      note_id: parseInt(cb.dataset.noteId, 10),
    }));
    await onSave(tags);
    overlay.remove();
  });
  actions.append(cancel, save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/** Theme/tag picker for notes. */
export function openThemeModal({ title, tags, selectedIds, onSave }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h3>${title}</h3>`;
  const list = document.createElement("div");
  list.className = "modal-list";
  const sel = new Set(selectedIds || []);

  tags.forEach((t) => {
    const label = document.createElement("label");
    label.className = "modal-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = t.id;
    cb.checked = sel.has(t.id);
    label.appendChild(cb);
    label.append(` ${t.name}`);
    list.appendChild(label);
  });
  modal.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancel = document.createElement("button");
  cancel.className = "btn";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => overlay.remove());
  const save = document.createElement("button");
  save.className = "btn btn-primary";
  save.textContent = "Save";
  save.addEventListener("click", async () => {
    const tag_ids = [...list.querySelectorAll("input:checked")].map((cb) => cb.value);
    await onSave(tag_ids);
    overlay.remove();
  });
  actions.append(cancel, save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
