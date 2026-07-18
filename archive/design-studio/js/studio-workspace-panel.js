/** Workspace tabs — Design studio right panel or inline. */

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

export function renderStudioWorkspacePanel({
  container,
  schema,
  onChange,
  onSelectEntity,
  variant = "inline",
}) {
  container.innerHTML = "";
  container.className =
    "studio-workspace-panel" + (variant === "sidebar" ? " studio-ws-sidebar" : "");
  container.appendChild(renderViewsSection(schema, onChange, onSelectEntity, variant));
}

function renderViewsSection(schema, onChange, onSelectEntity, variant) {
  const section = document.createElement("section");
  section.className = "ie-section studio-ws-section";

  const head = document.createElement("div");
  head.className = "ie-section-head studio-ws-head";
  head.innerHTML = "<span>Workspace tabs</span>";
  section.appendChild(head);
  const hint = variant === "sidebar"
    ? helpParagraph("Each tab is a view in Workspace — pick the Item, connections, and columns.")
    : helpParagraph(PANEL_HELP.views);
  hint.classList.add("design-studio-panel-hint");
  section.appendChild(hint);

  const list = document.createElement("div");
  list.className = "ie-field-list studio-view-list";

  const views = schema.views || [];
  if (!views.length) {
    list.innerHTML = `<p class="muted studio-ws-empty">No tabs yet — add one below.</p>`;
  } else {
    views.forEach((view, i) => {
      list.appendChild(renderViewRow(view, schema, onChange, variant, i === 0));
    });
  }
  section.appendChild(list);
  section.appendChild(renderAddViewRow(schema, onChange, variant));
  return section;
}

function renderViewRow(view, schema, onChange, variant, openDefault = false) {
  ensureViewShape(view, schema);
  const entity = schema.entity_types[view.entity];
  const nCols = getViewColumns(view, schema).length;

  const details = document.createElement("details");
  details.className = "ie-field-item ie-view-item" + (variant === "sidebar" ? " ws-tab-card" : "");
  if (openDefault) details.open = true;

  const summary = document.createElement("summary");
  summary.className = "ie-field-summary";
  summary.innerHTML = variant === "sidebar"
    ? `<span class="ws-tab-summary-name">${escapeHtml(view.label || "Tab")}</span><span class="ws-tab-badges"><span class="ws-tab-badge muted">${escapeHtml(entity?.label || view.entity)}</span><span class="ws-tab-badge muted">${nCols} col</span></span>`
    : escapeHtml(`${view.label || "Tab"} · ${entity?.label || view.entity} · ${nCols} col`);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "ie-field-body ws-tab-body";

  if (variant === "sidebar") {
    body.appendChild(renderSidebarTabForm(view, schema, onChange, summary));
  } else {
    body.appendChild(renderInlineTabForm(view, schema, onChange, summary));
  }

  details.appendChild(body);
  return details;
}

function renderSidebarTabForm(view, schema, onChange, summary) {
  const wrap = document.createElement("div");
  wrap.className = "ws-tab-form";

  const nameLabel = formRow("Tab name");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ie-input";
  nameInput.value = view.label || "";
  nameInput.placeholder = "Name shown in Workspace";
  nameInput.addEventListener("change", () => {
    updateViewLabel(view, nameInput.value);
    refreshSummary(summary, view, schema);
    onChange(schema);
  });
  nameLabel.appendChild(nameInput);
  wrap.appendChild(nameLabel);

  const itemLabel = formRow("Primary Item");
  const entitySel = document.createElement("select");
  entitySel.className = "ie-input";
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
      alert(res.error);
      return;
    }
    refreshSummary(summary, view, schema);
    onChange(schema);
  });
  itemLabel.appendChild(entitySel);
  wrap.appendChild(itemLabel);

  wrap.appendChild(
    renderViewJoinsAndColumns(view, schema, () => {
      refreshSummary(summary, view, schema);
      onChange(schema);
    })
  );

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-sm ws-tab-delete";
  del.textContent = "Remove tab";
  del.addEventListener("click", () => {
    removeView(schema, view.id);
    onChange(schema);
  });
  wrap.appendChild(del);
  return wrap;
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

function formRow(label) {
  const row = document.createElement("label");
  row.className = "ws-form-row";
  const span = document.createElement("span");
  span.textContent = label;
  row.appendChild(span);
  return row;
}

function refreshSummary(summary, view, schema) {
  const entity = schema.entity_types[view.entity];
  const nCols = getViewColumns(view, schema).length;
  if (summary.querySelector(".ws-tab-summary-name")) {
    summary.querySelector(".ws-tab-summary-name").textContent = view.label || "Tab";
    const badges = summary.querySelector(".ws-tab-badges");
    if (badges) {
      badges.innerHTML = `<span class="ws-tab-badge muted">${entity?.label || view.entity}</span><span class="ws-tab-badge muted">${nCols} col</span>`;
    }
  } else {
    summary.textContent = `${view.label || "Tab"} · ${entity?.label || view.entity} · ${nCols} col`;
  }
}

function renderAddViewRow(schema, onChange, variant) {
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

  if (variant === "sidebar") {
    body.className += " ws-tab-form";
    const nameLabel = formRow("Tab name");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ie-input";
    nameInput.placeholder = "e.g. Notes, Tags";

    const itemLabel = formRow("Primary Item");
    const entitySel = document.createElement("select");
    entitySel.className = "ie-input";
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
    add.textContent = "Add tab";
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

    nameLabel.appendChild(nameInput);
    itemLabel.appendChild(entitySel);
    body.append(nameLabel, itemLabel, add);
  } else {
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
  }

  details.appendChild(body);
  details.addEventListener("toggle", () => {
    if (details.open) {
      const input = body.querySelector("input");
      if (input) setTimeout(() => input.focus(), 0);
    }
  });

  return details;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
