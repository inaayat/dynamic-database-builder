/** Inline studio item editor — editable title, fields, compact add dropdowns. */

import {
  FIELD_CATALOG,
  addLinkToEntity,
  addValueToEntity,
  createItemType,
  friendlyFieldType,
  isPrimaryKey,
  removeEntity,
  removeField,
  updateFieldLabel,
} from "./design-actions.js";
import { storageLabel } from "./help-text.js";

export function renderStudioItemEditor({
  container,
  schema,
  entityId,
  onSelectEntity,
  onChange,
}) {
  container.innerHTML = "";
  container.className = "studio-editor";

  container.appendChild(renderTypeBar(schema, entityId, onSelectEntity, onChange));

  if (!entityId || !schema.entity_types[entityId]) {
    container.appendChild(renderNewTypeInline(schema, onSelectEntity, onChange));
    return;
  }

  const entity = schema.entity_types[entityId];
  container.appendChild(renderTitleRow(entity, () => onChange(schema)));
  container.appendChild(renderFieldsSection(schema, entityId, entity, onChange));
  container.appendChild(renderLinksSection(schema, entityId, onSelectEntity));
  container.appendChild(renderFooter(schema, entityId, entity, onSelectEntity, onChange));
}

function renderTypeBar(schema, entityId, onSelectEntity, onChange) {
  const bar = document.createElement("div");
  bar.className = "ie-type-bar";

  const ids = Object.keys(schema.entity_types || {});
  if (ids.length) {
    const sel = document.createElement("select");
    sel.className = "ie-type-select";
    ids.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = schema.entity_types[id].label;
      opt.selected = id === entityId;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => onSelectEntity(sel.value));
    bar.appendChild(sel);
  }

  const newDrop = document.createElement("details");
  newDrop.className = "inline-drop";
  newDrop.innerHTML = `<summary class="inline-drop-trigger">+ Type</summary>`;
  const panel = document.createElement("div");
  panel.className = "inline-drop-panel inline-drop-panel-tight";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ie-input";
  input.placeholder = "e.g. Student, Note";
  const go = document.createElement("button");
  go.type = "button";
  go.className = "btn btn-primary btn-sm";
  go.textContent = "Create";
  go.addEventListener("click", () => {
    const created = createItemType(schema, input.value);
    if (created.error) {
      input.setCustomValidity(created.error);
      input.reportValidity();
      return;
    }
    input.value = "";
    newDrop.open = false;
    onChange(schema);
    onSelectEntity(created.id);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go.click();
  });
  panel.append(input, go);
  newDrop.appendChild(panel);
  bar.appendChild(newDrop);
  return bar;
}

function renderNewTypeInline(schema, onSelectEntity, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "ie-empty";
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = "Create your first type to start.";
  const row = document.createElement("div");
  row.className = "ie-inline-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ie-input";
  input.placeholder = "e.g. Notes, Students";
  const go = document.createElement("button");
  go.type = "button";
  go.className = "btn btn-primary btn-sm";
  go.textContent = "Create";
  go.addEventListener("click", () => {
    const created = createItemType(schema, input.value);
    if (created.error) {
      input.setCustomValidity(created.error);
      input.reportValidity();
      return;
    }
    onChange(schema);
    onSelectEntity(created.id);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go.click();
  });
  row.append(input, go);
  wrap.append(p, row);
  setTimeout(() => input.focus(), 0);
  return wrap;
}

function renderTitleRow(entity, commit) {
  const row = document.createElement("div");
  row.className = "ie-title-row";
  const label = document.createElement("label");
  label.className = "ie-label";
  label.textContent = "Title";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ie-input ie-title-input";
  input.value = entity.label || "";
  input.placeholder = "Type name";
  input.addEventListener("change", () => {
    entity.label = input.value.trim() || entity.label;
    if (!entity.label_plural) entity.label_plural = entity.label + "s";
    commit();
  });
  label.appendChild(input);
  row.appendChild(label);

  const plural = document.createElement("label");
  plural.className = "ie-label ie-label-compact";
  plural.textContent = "Plural";
  const pluralInput = document.createElement("input");
  pluralInput.type = "text";
  pluralInput.className = "ie-input";
  pluralInput.value = entity.label_plural || "";
  pluralInput.placeholder = "Plural";
  pluralInput.addEventListener("change", () => {
    entity.label_plural = pluralInput.value.trim() || entity.label + "s";
    commit();
  });
  plural.appendChild(pluralInput);
  row.appendChild(plural);
  return row;
}

function renderFieldsSection(schema, entityId, entity, onChange) {
  const section = document.createElement("section");
  section.className = "ie-section";

  const head = document.createElement("div");
  head.className = "ie-section-head";
  head.innerHTML = "<span>Fields</span>";
  section.appendChild(head);

  const list = document.createElement("div");
  list.className = "ie-field-list";

  Object.entries(entity.fields || {}).forEach(([fname, fdef]) => {
    if (fdef.design_only || fdef.type === "item_link") return;
    if (fdef.type === "foreign_key" && fdef.link_to) return;
    list.appendChild(renderFieldRow(entity, fname, fdef, schema, entityId, onChange));
  });

  list.appendChild(renderAddFieldDrop(schema, entityId, onChange));
  section.appendChild(list);
  return section;
}

function renderFieldRow(entity, fname, fdef, schema, entityId, onChange) {
  const row = document.createElement("div");
  row.className = "ie-field-row";
  const system = isPrimaryKey(entity, fname);

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "ie-input ie-field-label";
  labelInput.value = fdef.editor?.header || fname;
  labelInput.disabled = system;
  labelInput.placeholder = fname;
  if (!system) {
    labelInput.addEventListener("change", () => {
      updateFieldLabel(entity, fname, labelInput.value);
      onChange(schema);
    });
  }

  const type = document.createElement("span");
  type.className = "ie-field-type";
  type.textContent = system ? "key" : friendlyFieldType(fdef.type);

  row.append(labelInput, type);

  if (!system) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ie-field-remove";
    del.title = "Remove field";
    del.textContent = "×";
    del.addEventListener("click", () => {
      if (!confirm(`Remove “${labelInput.value}”?`)) return;
      removeField(schema, entityId, fname);
      onChange(schema);
    });
    row.appendChild(del);
  }
  return row;
}

function renderAddFieldDrop(schema, entityId, onChange) {
  const details = document.createElement("details");
  details.className = "inline-drop ie-add-field";
  details.innerHTML = `<summary class="inline-drop-trigger">+ Add field</summary>`;

  const panel = document.createElement("div");
  panel.className = "inline-drop-panel inline-drop-panel-tight";

  let mode = "value";
  const tabs = document.createElement("div");
  tabs.className = "ie-tabs";
  const valueTab = document.createElement("button");
  valueTab.type = "button";
  valueTab.className = "ie-tab selected";
  valueTab.textContent = "Value";
  const linkTab = document.createElement("button");
  linkTab.type = "button";
  linkTab.className = "ie-tab";
  linkTab.textContent = "Link";

  const body = document.createElement("div");
  body.className = "ie-tab-body";

  function setMode(next) {
    mode = next;
    valueTab.classList.toggle("selected", mode === "value");
    linkTab.classList.toggle("selected", mode === "link");
    body.innerHTML = "";
    body.appendChild(mode === "value" ? renderValueForm() : renderLinkForm());
  }

  valueTab.addEventListener("click", () => setMode("value"));
  linkTab.addEventListener("click", () => setMode("link"));
  tabs.append(valueTab, linkTab);
  panel.append(tabs, body);
  details.appendChild(panel);

  function closeAndRefresh() {
    details.open = false;
    onChange(schema);
  }

  function renderValueForm() {
    const wrap = document.createElement("div");
    wrap.className = "ie-form-stack";

    const label = document.createElement("input");
    label.type = "text";
    label.className = "ie-input";
    label.placeholder = "Label, e.g. Status";

    const typeSel = document.createElement("select");
    typeSel.className = "ie-input";
    FIELD_CATALOG.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.type;
      opt.textContent = f.label;
      typeSel.appendChild(opt);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary btn-sm";
    add.textContent = "Add";
    add.addEventListener("click", () => {
      const res = addValueToEntity(schema, entityId, {
        label: label.value,
        type: typeSel.value,
      });
      if (res.error) {
        label.setCustomValidity(res.error);
        label.reportValidity();
        return;
      }
      label.value = "";
      closeAndRefresh();
    });

    wrap.append(label, typeSel, add);
    setTimeout(() => label.focus(), 0);
    return wrap;
  }

  function renderLinkForm() {
    const wrap = document.createElement("div");
    wrap.className = "ie-form-stack";

    const label = document.createElement("input");
    label.type = "text";
    label.className = "ie-input";
    label.placeholder = "Label, e.g. Students";

    const targetSel = document.createElement("select");
    targetSel.className = "ie-input";
    const optNew = document.createElement("option");
    optNew.value = "__new__";
    optNew.textContent = "New type…";
    targetSel.appendChild(optNew);
    Object.entries(schema.entity_types || {}).forEach(([id, e]) => {
      if (id === entityId) return;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = e.label;
      targetSel.appendChild(opt);
    });

    const newName = document.createElement("input");
    newName.type = "text";
    newName.className = "ie-input";
    newName.placeholder = "New type name";
    newName.hidden = targetSel.value !== "__new__";
    targetSel.addEventListener("change", () => {
      newName.hidden = targetSel.value !== "__new__";
    });

    const relSel = document.createElement("select");
    relSel.className = "ie-input";
    ["junction", "containment", "assignment"].forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = storageLabel(id);
      relSel.appendChild(opt);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary btn-sm";
    add.textContent = "Add link";
    add.addEventListener("click", () => {
      const createNew = targetSel.value === "__new__";
      const res = addLinkToEntity(schema, entityId, {
        label: label.value,
        targetId: createNew ? null : targetSel.value,
        createNew,
        newLabel: newName.value || label.value,
        storage: relSel.value,
      });
      if (res.error) {
        label.setCustomValidity(res.error);
        label.reportValidity();
        return;
      }
      label.value = "";
      newName.value = "";
      closeAndRefresh();
    });

    wrap.append(label, targetSel, newName, relSel, add);
    setTimeout(() => label.focus(), 0);
    return wrap;
  }

  setMode("value");
  return details;
}

function renderLinksSection(schema, entityId, onSelectEntity) {
  const section = document.createElement("section");
  section.className = "ie-section ie-links-section";

  const head = document.createElement("div");
  head.className = "ie-section-head";
  head.innerHTML = "<span>Links</span>";
  section.appendChild(head);

  const rels = (schema.relationships || []).filter(
    (r) => r.from === entityId || r.to === entityId
  );

  const chips = document.createElement("div");
  chips.className = "ie-link-chips";
  if (!rels.length) {
    chips.innerHTML = `<span class="muted">None — use Add field → Link</span>`;
  } else {
    rels.forEach((rel) => {
      const otherId = rel.from === entityId ? rel.to : rel.from;
      const other = schema.entity_types[otherId];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "map-chip map-chip-btn";
      chip.textContent = `${other?.label || otherId} · ${storageLabel(rel.storage)}`;
      chip.addEventListener("click", () => onSelectEntity(otherId));
      chips.appendChild(chip);
    });
  }
  section.appendChild(chips);
  return section;
}

function renderFooter(schema, entityId, entity, onSelectEntity, onChange) {
  const foot = document.createElement("div");
  foot.className = "ie-footer";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-sm ie-delete";
  remove.textContent = "Delete type";
  remove.addEventListener("click", () => {
    if (!confirm(`Delete ${entity.label}?`)) return;
    removeEntity(schema, entityId);
    const next = Object.keys(schema.entity_types || {})[0] || null;
    onChange(schema);
    onSelectEntity(next);
  });
  foot.appendChild(remove);
  return foot;
}
