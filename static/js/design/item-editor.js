/** Inline studio item editor — editable title, fields, compact add dropdowns. */

import {
  FIELD_CATALOG,
  addLinkToEntity,
  addValueToEntity,
  convertFieldToLink,
  createItemType,
  friendlyFieldType,
  isPrimaryKey,
  removeEntity,
  removeField,
  syncEntityTitle,
  updateFieldLabel,
  updateFieldType,
  updateFieldLinkEntity,
} from "./design-actions.js";
import { matchEntityByName } from "./field-suggest.js";
import { renderStudioWorkspacePanel } from "./studio-workspace-panel.js";

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
    appendWorkspacePanel(container, schema, onChange, onSelectEntity);
    return;
  }

  const entity = schema.entity_types[entityId];
  container.appendChild(renderTitleRow(entity, () => onChange(schema)));
  container.appendChild(renderFieldsSection(schema, entityId, entity, onChange));
  container.appendChild(renderFooter(schema, entityId, entity, onSelectEntity, onChange));
  appendWorkspacePanel(container, schema, onChange, onSelectEntity);
}

function appendWorkspacePanel(container, schema, onChange, onSelectEntity) {
  const wsMount = document.createElement("div");
  container.appendChild(wsMount);
  renderStudioWorkspacePanel({
    container: wsMount,
    schema,
    onChange,
    onSelectEntity,
  });
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
  row.className = "ie-title-row ie-title-row-single";
  const label = document.createElement("label");
  label.className = "ie-label";
  label.textContent = "Type name";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "ie-input ie-title-input";
  input.value = entity.label || "";
  input.placeholder = "e.g. Student, Note";
  input.addEventListener("change", () => {
    syncEntityTitle(entity, input.value);
    commit();
  });
  label.appendChild(input);
  row.appendChild(label);
  return row;
}

function renderFieldsSection(schema, entityId, entity, onChange) {
  const section = document.createElement("section");
  section.className = "ie-section";

  const head = document.createElement("div");
  head.className = "ie-section-head";
  head.innerHTML = "<span>Fields</span>";
  section.appendChild(head);
  const hint = document.createElement("p");
  hint.className = "ie-section-hint muted";
  hint.textContent = "Pick an Item type on a field to link types. Connections show on the map.";
  section.appendChild(hint);

  const list = document.createElement("div");
  list.className = "ie-field-list";

  const entries = Object.entries(entity.fields || {}).filter(([fname, fdef]) => {
    if (fdef.design_only && fdef.type !== "item_link") return false;
    return true;
  });

  if (!entries.length) {
    list.appendChild(emptyFieldsHint());
  } else {
    entries.forEach(([fname, fdef]) => {
      list.appendChild(renderFieldItem(fname, fdef, entity, schema, entityId, onChange));
    });
  }

  list.appendChild(renderAddFieldRow(schema, entityId, onChange));
  section.appendChild(list);
  return section;
}

function emptyFieldsHint() {
  const p = document.createElement("p");
  p.className = "muted ie-fields-empty";
  p.textContent = "No fields yet.";
  return p;
}

function fieldSummaryMeta(fdef, schema, entityId) {
  if (fdef.type === "item_link") {
    const target = schema.entity_types[fdef.link_entity];
    return `Link · ${target?.label || fdef.link_entity}`;
  }
  if (fdef.type === "foreign_key" && fdef.link_to) {
    const target = schema.entity_types[fdef.link_to];
    return `Link · ${target?.label || fdef.link_to}`;
  }
  return friendlyFieldType(fdef.type);
}

function isLinkField(fdef) {
  return fdef.type === "item_link" || (fdef.type === "foreign_key" && fdef.link_to);
}

function populateItemTypeSelect(itemSel, schema, entityId, { value = "", includeNew = true }) {
  itemSel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  none.selected = !value;
  itemSel.appendChild(none);
  Object.entries(schema.entity_types || {}).forEach(([id, e]) => {
    if (id === entityId) return;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = e.label;
    opt.selected = id === value;
    itemSel.appendChild(opt);
  });
  if (includeNew) {
    const create = document.createElement("option");
    create.value = "__new__";
    create.textContent = "New type…";
    create.selected = value === "__new__";
    itemSel.appendChild(create);
  }
}

function renderFieldItem(fname, fdef, entity, schema, entityId, onChange) {
  const details = document.createElement("details");
  details.className = "ie-field-item";
  const system = isPrimaryKey(entity, fname);
  const link = isLinkField(fdef);
  const header = fdef.editor?.header || fname;

  const summary = document.createElement("summary");
  summary.className = "ie-field-summary";
  summary.innerHTML = `<span class="ie-field-summary-name">${escapeHtml(header)}</span><span class="ie-field-summary-meta muted">${escapeHtml(fieldSummaryMeta(fdef, schema, entityId))}</span>`;

  const body = document.createElement("div");
  body.className = "ie-field-body";
  const row = document.createElement("div");
  row.className = "ie-field-row";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "ie-input ie-field-label";
  labelInput.value = header;
  labelInput.placeholder = fname;
  labelInput.disabled = system;
  if (!system) {
    labelInput.addEventListener("change", () => {
      updateFieldLabel(entity, fname, labelInput.value);
      onChange(schema);
    });
  }

  const typeSel = document.createElement("select");
  typeSel.className = "ie-input ie-field-type-select";
  if (system) {
    const opt = document.createElement("option");
    opt.textContent = "key";
    typeSel.appendChild(opt);
    typeSel.disabled = true;
  } else if (link) {
    const linkOpt = document.createElement("option");
    linkOpt.textContent = "Link";
    typeSel.appendChild(linkOpt);
    typeSel.disabled = true;
  } else {
    const current = FIELD_CATALOG.some((f) => f.type === fdef.type) ? fdef.type : "text";
    FIELD_CATALOG.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.type;
      opt.textContent = f.label;
      opt.selected = f.type === current;
      typeSel.appendChild(opt);
    });
    typeSel.addEventListener("change", () => {
      const res = updateFieldType(entity, fname, typeSel.value);
      if (res.error) {
        typeSel.setCustomValidity(res.error);
        typeSel.reportValidity();
        return;
      }
      typeSel.setCustomValidity("");
      onChange(schema);
    });
  }

  const itemSel = document.createElement("select");
  itemSel.className = "ie-input ie-field-item-select";
  const linkTarget = fdef.link_entity || fdef.link_to || "";
  populateItemTypeSelect(itemSel, schema, entityId, {
    value: link ? linkTarget : "",
    includeNew: !link,
  });

  if (link && fdef.type === "item_link") {
    itemSel.addEventListener("change", () => {
      if (!itemSel.value || itemSel.value === "__new__") return;
      const res = updateFieldLinkEntity(schema, entityId, fname, itemSel.value);
      if (res.error) {
        itemSel.setCustomValidity(res.error);
        itemSel.reportValidity();
        return;
      }
      itemSel.setCustomValidity("");
      onChange(schema);
    });
  } else if (!system && !link) {
    itemSel.addEventListener("change", () => {
      if (!itemSel.value) return;
      const createNew = itemSel.value === "__new__";
      const res = convertFieldToLink(schema, entityId, fname, {
        targetId: createNew ? null : itemSel.value,
        createNew,
        newLabel: labelInput.value.trim() || fname,
      });
      if (res.error) {
        itemSel.setCustomValidity(res.error);
        itemSel.reportValidity();
        itemSel.value = "";
        return;
      }
      itemSel.setCustomValidity("");
      onChange(schema);
    });
  } else {
    itemSel.disabled = true;
  }

  row.append(labelInput, typeSel, itemSel);

  if (!system) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ie-field-remove";
    del.title = "Remove field";
    del.textContent = "×";
    del.addEventListener("click", () => {
      removeField(schema, entityId, fname);
      onChange(schema);
    });
    row.appendChild(del);
  }

  body.appendChild(row);
  details.append(summary, body);
  return details;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderAddFieldRow(schema, entityId, onChange) {
  const details = document.createElement("details");
  details.className = "ie-field-item ie-add-field-item";
  details.innerHTML = `<summary class="ie-field-summary ie-add-field-summary">+ Add field</summary>`;

  const body = document.createElement("div");
  body.className = "ie-field-body";
  const row = document.createElement("div");
  row.className = "ie-add-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ie-input ie-add-name";
  nameInput.placeholder = "Field name";

  const fieldTypeSel = document.createElement("select");
  fieldTypeSel.className = "ie-input ie-add-field-type";
  fieldTypeSel.title = "Field type";
  FIELD_CATALOG.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.type;
    opt.textContent = f.label;
    fieldTypeSel.appendChild(opt);
  });

  const itemTypeSel = document.createElement("select");
  itemTypeSel.className = "ie-input ie-add-item-type";
  itemTypeSel.title = "Item type (link)";

  function rebuildItemOptions(preferredId = "") {
    const prev = preferredId || itemTypeSel.value;
    itemTypeSel.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "—";
    itemTypeSel.appendChild(none);
    Object.entries(schema.entity_types || {}).forEach(([id, e]) => {
      if (id === entityId) return;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = e.label;
      itemTypeSel.appendChild(opt);
    });
    const create = document.createElement("option");
    create.value = "__new__";
    create.textContent = "New type…";
    itemTypeSel.appendChild(create);
    const values = [...itemTypeSel.options].map((o) => o.value);
    itemTypeSel.value = values.includes(prev) ? prev : "";
    syncFieldTypeState();
  }

  function syncFieldTypeState() {
    const linking = Boolean(itemTypeSel.value);
    fieldTypeSel.disabled = linking;
    fieldTypeSel.classList.toggle("ie-input-muted", linking);
  }

  function autoSelectItemFromName() {
    const match = matchEntityByName(schema, entityId, nameInput.value);
    if (match) {
      itemTypeSel.value = match.id;
      syncFieldTypeState();
    }
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "btn btn-primary btn-sm";
  add.textContent = "Add";

  row.append(nameInput, fieldTypeSel, itemTypeSel, add);
  body.appendChild(row);
  details.appendChild(body);

  function closeAndRefresh() {
    details.open = false;
    nameInput.value = "";
    rebuildItemOptions("");
    onChange(schema);
  }

  nameInput.addEventListener("input", autoSelectItemFromName);

  itemTypeSel.addEventListener("change", syncFieldTypeState);

  add.addEventListener("click", () => {
    const label = nameInput.value.trim();
    if (!label) {
      nameInput.setCustomValidity("Enter a field name.");
      nameInput.reportValidity();
      return;
    }
    nameInput.setCustomValidity("");

    const itemChoice = itemTypeSel.value;

    if (itemChoice) {
      const createNew = itemChoice === "__new__";
      const res = addLinkToEntity(schema, entityId, {
        label,
        targetId: createNew ? null : itemChoice,
        createNew,
        newLabel: label,
        storage: "junction",
      });
      if (res.error) {
        nameInput.setCustomValidity(res.error);
        nameInput.reportValidity();
        return;
      }
    } else {
      const res = addValueToEntity(schema, entityId, {
        label,
        type: fieldTypeSel.value,
      });
      if (res.error) {
        nameInput.setCustomValidity(res.error);
        nameInput.reportValidity();
        return;
      }
    }

    closeAndRefresh();
  });

  rebuildItemOptions();
  details.addEventListener("toggle", () => {
    if (details.open) setTimeout(() => nameInput.focus(), 0);
  });

  return details;
}

function renderFooter(schema, entityId, entity, onSelectEntity, onChange) {
  const foot = document.createElement("div");
  foot.className = "ie-footer";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-sm ie-delete";
  remove.textContent = "Delete type";
  remove.addEventListener("click", () => {
    removeEntity(schema, entityId);
    const next = Object.keys(schema.entity_types || {})[0] || null;
    onChange(schema);
    onSelectEntity(next);
  });
  foot.appendChild(remove);
  return foot;
}
