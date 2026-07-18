/** Workspace tabs editor — inline panel for brainstorm finish step. */

import {
  createView,
  removeView,
  updateViewEntity,
  updateViewLabel,
  defaultViewLabelForEntity,
} from "./design-actions.js";
import { helpParagraph, PANEL_HELP } from "./help-text.js";
import { renderViewJoinsAndColumns } from "./view-tab-editor.js";
import { ensureViewShape, getViewColumns } from "../view-columns.js";

export function renderWorkspaceTabsPanel({ container, schema, onChange }) {
  container.innerHTML = "";
  container.className = "workspace-tabs-panel";
  container.appendChild(renderViewsSection(schema, onChange));
}

function renderViewsSection(schema, onChange) {
  const section = document.createElement("section");
  section.className = "ie-section ws-tabs-section";

  const head = document.createElement("div");
  head.className = "ie-section-head ws-tabs-head";
  head.innerHTML = "<span>Workspace tabs</span>";
  section.appendChild(head);
  const hint = helpParagraph(PANEL_HELP.views);
  hint.classList.add("design-panel-hint");
  section.appendChild(hint);

  const list = document.createElement("div");
  list.className = "ie-field-list ws-tabs-list";

  const views = schema.views || [];
  if (!views.length) {
    list.innerHTML = `<p class="muted ws-tabs-empty">No tabs yet — add one below.</p>`;
  } else {
    views.forEach((view, i) => {
      list.appendChild(renderViewRow(view, schema, onChange, i === 0));
    });
  }
  section.appendChild(list);
  section.appendChild(renderAddViewRow(schema, onChange));
  return section;
}

function renderViewRow(view, schema, onChange, openDefault = false) {
  ensureViewShape(view, schema);
  const entity = schema.entity_types[view.entity];
  const nCols = getViewColumns(view, schema).length;

  const details = document.createElement("details");
  details.className = "ie-field-item ie-view-item";
  if (openDefault) details.open = true;

  const summary = document.createElement("summary");
  summary.className = "ie-field-summary";
  summary.textContent = `${view.label || "Tab"} · ${entity?.label || view.entity} · ${nCols} col`;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "ie-field-body ws-tab-body";
  body.appendChild(renderInlineTabForm(view, schema, onChange, summary));
  details.appendChild(body);
  return details;
}

function renderInlineTabForm(view, schema, onChange, summary) {
  const frag = document.createDocumentFragment();
  const row = document.createElement("div");
  row.className = "ie-field-row ie-view-row ie-view-row-compact";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ie-input ie-field-label";
  nameInput.value = view.label || "";
  nameInput.placeholder = "Tab name";
  nameInput.addEventListener("change", () => {
    updateViewLabel(view, nameInput.value);
    refreshSummary(summary, view, schema);
    onChange(schema);
  });

  const entitySel = document.createElement("select");
  entitySel.className = "ie-input ie-field-item-select";
  Object.entries(schema.entity_types || {}).forEach(([id, ent]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = ent.label;
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
    refreshSummary(summary, view, schema);
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

  row.append(nameInput, entitySel, del);
  frag.appendChild(row);
  frag.appendChild(
    renderViewJoinsAndColumns(view, schema, () => {
      refreshSummary(summary, view, schema);
      onChange(schema);
    })
  );
  return frag;
}

function refreshSummary(summary, view, schema) {
  const entity = schema.entity_types[view.entity];
  const nCols = getViewColumns(view, schema).length;
  summary.textContent = `${view.label || "Tab"} · ${entity?.label || view.entity} · ${nCols} col`;
}

function renderAddViewRow(schema, onChange) {
  const details = document.createElement("details");
  details.className = "ie-field-item ie-add-field-item ws-add-tab";
  details.innerHTML = `<summary class="ie-field-summary ie-add-field-summary">+ Tab</summary>`;

  const body = document.createElement("div");
  body.className = "ie-field-body ws-tab-body";

  const ids = Object.keys(schema.entity_types || {});
  if (!ids.length) {
    body.innerHTML = `<p class="muted">Create an Item type first.</p>`;
    details.appendChild(body);
    return details;
  }

  const row = document.createElement("div");
  row.className = "ie-add-row ie-view-add-row ie-view-row-compact";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ie-input ie-add-name";
  nameInput.placeholder = "Tab name";

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

  row.append(nameInput, entitySel, add);
  body.appendChild(row);
  details.appendChild(body);
  details.addEventListener("toggle", () => {
    if (details.open) {
      const input = body.querySelector("input");
      if (input) setTimeout(() => input.focus(), 0);
    }
  });

  return details;
}
