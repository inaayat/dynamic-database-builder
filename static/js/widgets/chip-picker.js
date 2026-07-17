/** Generic multi-select picker for junction chip columns. */

import {
  defaultNewRow,
  displayFieldForEntity,
  entityListUrl,
  itemLabel,
} from "../entity-api.js";

export function openChipPicker({
  title,
  items,
  entity,
  entityId,
  containerId,
  schema,
  selectedIds,
  onSave,
  allowCreate = true,
}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
  const list = document.createElement("div");
  list.className = "modal-list";
  const sel = new Set((selectedIds || []).map(String));
  const catalog = [...(items || [])];

  function appendItemCheckbox(item) {
    const label = document.createElement("label");
    label.className = "modal-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(item.id);
    cb.checked = sel.has(String(item.id));
    cb.addEventListener("change", () => {
      if (cb.checked) sel.add(String(item.id));
      else sel.delete(String(item.id));
    });
    label.appendChild(cb);
    label.append(` ${escapeHtml(itemLabel(item, entity))}`);
    list.appendChild(label);
  }

  catalog.forEach(appendItemCheckbox);

  if (!catalog.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No items to pick.";
    list.appendChild(empty);
  }

  modal.appendChild(list);

  let createInput = null;
  if (allowCreate && entityId && schema) {
    const createRow = document.createElement("div");
    createRow.className = "chip-picker-create";
    createInput = document.createElement("input");
    createInput.type = "text";
    createInput.className = "ie-input";
    createInput.placeholder = `New ${entity?.label || entityId}…`;
    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "btn btn-sm btn-primary";
    createBtn.textContent = "Create & add";
    createBtn.addEventListener("click", async () => {
      const name = createInput.value.trim();
      if (!name) {
        createInput.focus();
        return;
      }
      createBtn.disabled = true;
      try {
        const field = displayFieldForEntity(entity);
        const body = defaultNewRow(schema, entityId);
        body[field] = name;
        const res = await fetch(entityListUrl(entityId, containerId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        catalog.push(created);
        list.querySelector(".muted")?.remove();
        appendItemCheckbox(created);
        sel.add(String(created.id));
        const cb = list.querySelector(`input[value="${CSS.escape(String(created.id))}"]`);
        if (cb) cb.checked = true;
        createInput.value = "";
        createInput.focus();
      } catch (err) {
        alert(err.message || "Could not create item.");
      } finally {
        createBtn.disabled = false;
      }
    });
    createInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") createBtn.click();
    });
    createRow.append(createInput, createBtn);
    modal.appendChild(createRow);
  }

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
    const linked_ids = [...list.querySelectorAll("input:checked")].map((cb) => {
      const raw = cb.value;
      const asNum = Number(raw);
      return Number.isInteger(asNum) && String(asNum) === raw ? asNum : raw;
    });
    await onSave(linked_ids);
    overlay.remove();
  });
  actions.append(cancel, save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  if (createInput) createInput.focus();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
