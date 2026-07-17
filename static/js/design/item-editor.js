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
import { helpParagraph, PANEL_HELP } from "./help-text.js";

export function renderStudioItemEditor({
  container,
  schema,
  entityId,
  onSelectEntity,
  onChange,
}) {
  container.innerHTML = "";
  container.className = "studio-editor";

  const ids = Object.keys(schema.entity_types || {});
  if (!ids.length) {
    container.appendChild(renderNewTypeInline(schema, onSelectEntity, onChange));
    return;
  }

  container.appendChild(renderItemsPanel(schema, entityId, onSelectEntity, onChange));
}

function renderItemsPanel(schema, entityId, onSelectEntity, onChange) {
  const section = document.createElement("section");
  section.className = "ie-section ie-types-section";

  const head = document.createElement("div");
  head.className = "ie-section-head";
  head.innerHTML = "<span>Items</span>";
  section.appendChild(head);
  const hint = helpParagraph(PANEL_HELP.entities);
  hint.classList.add("design-studio-panel-hint");
  section.appendChild(hint);

  const list = document.createElement("div");
  list.className = "ie-type-list";

  Object.keys(schema.entity_types || {}).forEach((id) => {
    list.appendChild(renderItemTypeDetails(id, schema, entityId, onSelectEntity, onChange));
  });

  list.appendChild(renderAddTypeRow(schema, onSelectEntity, onChange));
  section.appendChild(list);
  return section;
}

function renderItemTypeDetails(id, schema, selectedId, onSelectEntity, onChange) {
  const entity = schema.entity_types[id];
  const nFields = Object.values(entity.fields || {}).filter(
    (f) => !(f.design_only && f.type !== "item_link")
  ).length;
  const selected = id === selectedId;

  const details = document.createElement("details");
  details.className = "ie-field-item ie-type-item" + (selected ? " selected" : "");
  if (selected) details.open = true;

  const summary = document.createElement("summary");
  summary.className = "ie-field-summary";
  summary.innerHTML = `<span class="ie-field-summary-name">${escapeHtml(entity.label || id)}</span><span class="ie-field-summary-meta muted">${nFields} field${nFields === 1 ? "" : "s"}</span>`;

  const body = document.createElement("div");
  body.className = "ie-field-body ie-type-body";

  body.appendChild(renderTitleRow(entity, () => onChange(schema)));
  body.appendChild(renderFieldsBlock(schema, id, entity, onChange));
  body.appendChild(renderTypeFooter(schema, id, onSelectEntity, onChange));

  details.append(summary, body);

  details.addEventListener("toggle", () => {
    if (details.open) onSelectEntity(id);
  });

  return details;
}

function renderFieldsBlock(schema, entityId, entity, onChange) {
  const block = document.createElement("div");
  block.className = "ie-fields-block";

  const head = document.createElement("div");
  head.className = "ie-section-head";
  head.innerHTML = "<span>Fields</span>";
  block.appendChild(head);

  const list = document.createElement("div");
  list.className = "ie-field-list";

  const entries = Object.entries(entity.fields || {}).filter(([, fdef]) => {
    if (fdef.design_only && fdef.type !== "item_link") return false;
    return true;
  });

  if (!entries.length) {
    list.appendChild(emptyFieldsHint());
  } else {
    entries.forEach(([fname, fdef]) => {
      list.appendChild(renderFieldItem(fname, fdef, entity, schema, entityId, onChange, { inline: true }));
    });
  }

  list.appendChild(renderAddFieldRow(schema, entityId, onChange));
  block.appendChild(list);
  return block;
}

function renderTypeFooter(schema, entityId, onSelectEntity, onChange) {
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

function renderAddTypeRow(schema, onSelectEntity, onChange) {
  const details = document.createElement("details");
  details.className = "ie-field-item ie-add-field-item";
  details.innerHTML = `<summary class="ie-field-summary ie-add-field-summary">+ Type</summary>`;

  const body = document.createElement("div");
  body.className = "ie-field-body";
  const row = document.createElement("div");
  row.className = "ie-inline-row";

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
    details.open = false;
    onChange(schema);
    onSelectEntity(created.id);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go.click();
  });

  row.append(input, go);
  body.appendChild(row);
  details.appendChild(body);
  details.addEventListener("toggle", () => {
    if (details.open) setTimeout(() => input.focus(), 0);
  });
  return details;
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


function renderFieldItem(fname, fdef, entity, schema, entityId, onChange, { inline = false } = {}) {
  const system = isPrimaryKey(entity, fname);
  const link = isLinkField(fdef);
  const header = fdef.editor?.header || fname;

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

  if (inline) {
    const wrap = document.createElement("div");
    wrap.className = "ie-field-item ie-field-inline";
    wrap.appendChild(row);
    return wrap;
  }

  const details = document.createElement("details");
  details.className = "ie-field-item";
  const summary = document.createElement("summary");
  summary.className = "ie-field-summary";
  summary.innerHTML = `<span class="ie-field-summary-name">${escapeHtml(header)}</span><span class="ie-field-summary-meta muted">${escapeHtml(fieldSummaryMeta(fdef, schema, entityId))}</span>`;
  const body = document.createElement("div");
  body.className = "ie-field-body";
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
