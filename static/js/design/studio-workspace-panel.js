/** Workspace tabs in the item editor. */

import {
  createView,
  removeView,
  updateViewEntity,
  updateViewLabel,
  updateViewType,
  VIEW_TYPE_OPTIONS,
  defaultViewLabelForEntity,
} from "./design-actions.js";
import { helpParagraph, PANEL_HELP } from "./help-text.js";

export function renderStudioWorkspacePanel({ container, schema, onChange, onSelectEntity }) {
  container.innerHTML = "";
  container.className = "studio-workspace-panel";
  container.appendChild(renderViewsSection(schema, onChange, onSelectEntity));
}

function renderViewsSection(schema, onChange, onSelectEntity) {
  const section = document.createElement("section");
  section.className = "ie-section studio-ws-section";

  const head = document.createElement("div");
  head.className = "ie-section-head studio-ws-head";
  head.innerHTML = "<span>Workspace tabs</span>";
  section.appendChild(head);
  section.appendChild(helpParagraph(PANEL_HELP.views));

  const list = document.createElement("div");
  list.className = "ie-field-list studio-view-list";

  const views = schema.views || [];
  if (!views.length) {
    list.innerHTML = `<p class="muted studio-ws-empty">No tabs yet — add one below.</p>`;
  } else {
    views.forEach((view) => {
      list.appendChild(renderViewRow(view, schema, onChange));
    });
  }
  section.appendChild(list);
  section.appendChild(renderAddViewRow(schema, onChange));
  return section;
}

function renderViewRow(view, schema, onChange) {
  const row = document.createElement("div");
  row.className = "ie-field-row ie-view-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ie-input ie-field-label";
  nameInput.value = view.label || "";
  nameInput.placeholder = "Tab name";
  nameInput.title = "Name shown on the Workspace tab";
  nameInput.addEventListener("change", () => {
    updateViewLabel(view, nameInput.value);
    onChange(schema);
  });

  const typeSel = document.createElement("select");
  typeSel.className = "ie-input ie-field-type-select";
  VIEW_TYPE_OPTIONS.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    el.selected = view.type === opt.value;
    typeSel.appendChild(el);
  });
  typeSel.addEventListener("change", () => {
    const res = updateViewType(view, schema, typeSel.value);
    if (res.error) {
      typeSel.setCustomValidity(res.error);
      typeSel.reportValidity();
      return;
    }
    typeSel.setCustomValidity("");
    onChange(schema);
  });

  const entitySel = document.createElement("select");
  entitySel.className = "ie-input ie-field-item-select";
  Object.entries(schema.entity_types || {}).forEach(([id, entity]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = entity.label;
    opt.selected = id === view.entity;
    entitySel.appendChild(opt);
  });
  entitySel.addEventListener("change", () => {
    const res = updateViewEntity(view, schema, entitySel.value);
    if (res.error) {
      entitySel.setCustomValidity(res.error);
      entitySel.reportValidity();
      return;
    }
    entitySel.setCustomValidity("");
    onChange(schema);
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "ie-field-remove";
  del.textContent = "×";
  del.title = "Remove tab";
  del.addEventListener("click", () => {
    removeView(schema, view.id);
    onChange(schema);
  });

  row.append(nameInput, typeSel, entitySel, del);
  return row;
}

function renderAddViewRow(schema, onChange) {
  const details = document.createElement("details");
  details.className = "ie-field-item ie-add-field-item";
  details.innerHTML = `<summary class="ie-field-summary ie-add-field-summary">+ Tab</summary>`;

  const body = document.createElement("div");
  body.className = "ie-field-body";
  const row = document.createElement("div");
  row.className = "ie-add-row ie-view-add-row";

  const ids = Object.keys(schema.entity_types || {});
  if (!ids.length) {
    body.innerHTML = `<p class="muted">Create an Item type first.</p>`;
    details.appendChild(body);
    return details;
  }

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ie-input ie-add-name";
  nameInput.placeholder = "Tab name";

  const typeSel = document.createElement("select");
  typeSel.className = "ie-input ie-add-field-type";
  VIEW_TYPE_OPTIONS.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    typeSel.appendChild(el);
  });

  const entitySel = document.createElement("select");
  entitySel.className = "ie-input ie-add-item-type";
  ids.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = schema.entity_types[id].label;
    entitySel.appendChild(opt);
  });

  const syncPlaceholder = () => {
    const ent = schema.entity_types[entitySel.value];
    if (!nameInput.value.trim()) {
      nameInput.placeholder = defaultViewLabelForEntity(ent);
    }
  };
  entitySel.addEventListener("change", syncPlaceholder);
  syncPlaceholder();

  const add = document.createElement("button");
  add.type = "button";
  add.className = "btn btn-primary btn-sm";
  add.textContent = "Add";
  add.addEventListener("click", () => {
    const created = createView(schema, {
      entityId: entitySel.value,
      type: typeSel.value,
      label: nameInput.value,
    });
    if (created.error) {
      nameInput.setCustomValidity(created.error);
      nameInput.reportValidity();
      return;
    }
    nameInput.value = "";
    details.open = false;
    onChange(schema);
  });

  row.append(nameInput, typeSel, entitySel, add);
  body.appendChild(row);
  details.appendChild(body);

  details.addEventListener("toggle", () => {
    if (details.open) setTimeout(() => nameInput.focus(), 0);
  });

  return details;
}
