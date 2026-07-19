/** Shared UI for editing a workspace tab's joins and columns. */

import {
  COLUMN_MODE_OPTIONS,
  columnCandidates,
  columnLabel,
  columnModeLabel,
  ensureViewShape,
  isColumnIncluded,
  moveViewColumn,
  relationshipsForEntity,
  relationshipLabel,
  removeViewColumn,
  reorderViewColumn,
  toggleColumnCandidate,
  toggleViewJoin,
  updateViewColumn,
} from "../view-columns.js";

export function renderViewJoinsAndColumns(view, schema, onChange) {
  ensureViewShape(view, schema);
  const wrap = document.createElement("div");
  wrap.className = "view-tab-config";

  const rels = relationshipsForEntity(schema, view.entity);
  if (rels.length) {
    const joinsBlock = document.createElement("div");
    joinsBlock.className = "view-joins-block";
    joinsBlock.innerHTML = "<span class='view-config-label'>Connected Items</span>";
    const joinList = document.createElement("div");
    joinList.className = "view-join-list";
    rels.forEach((rel) => {
      const label = document.createElement("label");
      label.className = "view-join-check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = (view.joins || []).some((j) => j.relationship_id === rel.id);
      cb.addEventListener("change", () => {
        toggleViewJoin(view, schema, rel.id);
        onChange();
      });
      label.append(cb, document.createTextNode(` ${relationshipLabel(schema, rel, view.entity)}`));
      joinList.appendChild(label);
    });
    joinsBlock.appendChild(joinList);
    wrap.appendChild(joinsBlock);
  }

  const colsBlock = document.createElement("div");
  colsBlock.className = "view-columns-block";
  colsBlock.innerHTML =
    "<span class='view-config-label'>Column layout</span>" +
    "<p class='muted view-config-hint'>Drag to reorder — changes apply live in the table.</p>";

  const preview = document.createElement("div");
  preview.className = "column-live-preview";
  preview.setAttribute("aria-hidden", "true");

  const colList = document.createElement("div");
  colList.className = "view-column-list view-column-list-sortable";

  function renderPreview() {
    preview.innerHTML = "";
    if (!(view.columns || []).length) {
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    (view.columns || []).forEach((col) => {
      const chip = document.createElement("span");
      chip.className = "column-live-chip";
      chip.textContent = columnLabel(col, schema, view);
      chip.draggable = true;
      chip.dataset.columnId = col.id;
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", col.id);
        chip.classList.add("dragging");
      });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
      chip.addEventListener("dragover", (e) => {
        e.preventDefault();
        chip.classList.add("drag-over");
      });
      chip.addEventListener("dragleave", () => chip.classList.remove("drag-over"));
      chip.addEventListener("drop", (e) => {
        e.preventDefault();
        chip.classList.remove("drag-over");
        const fromId = e.dataTransfer.getData("text/plain");
        if (!fromId || fromId === col.id) return;
        const chips = [...preview.querySelectorAll(".column-live-chip")];
        const toIndex = chips.findIndex((c) => c.dataset.columnId === col.id);
        reorderViewColumn(view, fromId, toIndex);
        renderIncludedColumns();
        onChange();
      });
      preview.appendChild(chip);
    });
  }

  function renderIncludedColumns() {
    colList.innerHTML = "";
    if (!(view.columns || []).length) {
      colList.innerHTML = "<p class='muted ws-tabs-empty'>No columns yet — check fields below.</p>";
      renderPreview();
      return;
    }
    (view.columns || []).forEach((col, index) => {
      colList.appendChild(
        renderColumnRow(col, view, schema, colList, onChange, renderIncludedColumns, index)
      );
    });
    enableColumnDragDrop(colList, view, onChange, renderIncludedColumns);
    renderPreview();
  }

  renderIncludedColumns();
  colsBlock.append(preview, colList);

  const availBlock = document.createElement("div");
  availBlock.className = "view-column-avail";
  availBlock.innerHTML = "<span class='view-config-label'>Include fields</span>";
  availBlock.appendChild(renderColumnCandidates(view, schema, onChange, renderIncludedColumns));
  colsBlock.appendChild(availBlock);

  wrap.appendChild(colsBlock);
  return wrap;
}

function renderColumnCandidates(view, schema, onChange, refreshIncluded) {
  const wrap = document.createElement("div");
  const candidates = columnCandidates(schema, view);
  if (!candidates.length) {
    wrap.innerHTML = "<p class='muted'>Pick a primary Item and connections to see fields.</p>";
    return wrap;
  }

  const groups = new Map();
  candidates.forEach((c) => {
    const g = c.group || "Fields";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  });

  groups.forEach((items, groupName) => {
    const groupEl = document.createElement("div");
    groupEl.className = "column-candidate-group";
    const head = document.createElement("div");
    head.className = "column-candidate-group-head";
    head.textContent = groupName;
    groupEl.appendChild(head);
    const list = document.createElement("div");
    list.className = "column-candidate-list";
    items.forEach((candidate) => {
      const label = document.createElement("label");
      label.className = "column-candidate-check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isColumnIncluded(view, candidate.id);
      cb.addEventListener("change", () => {
        toggleColumnCandidate(view, schema, candidate);
        refreshIncluded();
        onChange();
      });
      const meta =
        candidate.mode === "chip"
          ? " · chips"
          : candidate.mode === "view"
            ? " · read-only"
            : "";
      label.append(cb, document.createTextNode(` ${candidate.label}${meta}`));
      list.appendChild(label);
    });
    groupEl.appendChild(list);
    wrap.appendChild(groupEl);
  });
  return wrap;
}

function renderColumnRow(col, view, schema, colList, onChange, refreshIncluded, index) {
  const row = document.createElement("div");
  row.className = "view-column-row";
  row.draggable = true;
  row.dataset.columnId = col.id;

  const handle = document.createElement("span");
  handle.className = "view-column-drag";
  handle.textContent = "⋮⋮";
  handle.title = "Drag to reorder";

  const label = document.createElement("span");
  label.className = "view-column-name";
  label.textContent = columnLabel(col, schema, view);

  const modeSel = document.createElement("select");
  modeSel.className = "ie-input ie-field-type-select";
  if (col.source === "join" && col.mode === "chip") {
    const opt = document.createElement("option");
    opt.value = "chip";
    opt.textContent = columnModeLabel("chip");
    modeSel.appendChild(opt);
    modeSel.disabled = true;
  } else if (col.source === "join" && col.field) {
    [
      { value: "edit", label: "Editable" },
      { value: "view", label: "Read-only" },
    ].forEach((optDef) => {
      const opt = document.createElement("option");
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      opt.selected = (col.mode || "edit") === optDef.value;
      modeSel.appendChild(opt);
    });
    modeSel.addEventListener("change", () => {
      updateViewColumn(view, col.id, { mode: modeSel.value });
      onChange();
    });
  } else {
    const primaryModes = COLUMN_MODE_OPTIONS.filter((o) => o.value !== "chip");
    primaryModes.forEach((optDef) => {
      const opt = document.createElement("option");
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      opt.selected = (col.mode || "edit") === optDef.value;
      modeSel.appendChild(opt);
    });
    modeSel.addEventListener("change", () => {
      updateViewColumn(view, col.id, { mode: modeSel.value });
      onChange();
    });
  }

  const moveBtns = document.createElement("div");
  moveBtns.className = "view-column-move";
  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "btn-icon view-column-move-btn";
  upBtn.textContent = "↑";
  upBtn.title = "Move up";
  upBtn.disabled = index === 0;
  upBtn.addEventListener("click", () => {
    moveViewColumn(view, col.id, -1);
    refreshIncluded();
    onChange();
  });
  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "btn-icon view-column-move-btn";
  downBtn.textContent = "↓";
  downBtn.title = "Move down";
  downBtn.disabled = index >= (view.columns || []).length - 1;
  downBtn.addEventListener("click", () => {
    moveViewColumn(view, col.id, 1);
    refreshIncluded();
    onChange();
  });
  moveBtns.append(upBtn, downBtn);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "ie-field-remove";
  del.textContent = "×";
  del.title = "Remove column";
  del.addEventListener("click", () => {
    removeViewColumn(view, col.id);
    refreshIncluded();
    onChange();
  });

  row.append(handle, label, modeSel, moveBtns, del);
  return row;
}

function enableColumnDragDrop(colList, view, onChange, refreshIncluded) {
  let dragId = null;

  colList.querySelectorAll(".view-column-row").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.columnId;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      colList.querySelectorAll(".view-column-row").forEach((r) => r.classList.remove("drag-over"));
      dragId = null;
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (row.dataset.columnId !== dragId) row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const fromId = e.dataTransfer.getData("text/plain") || dragId;
      if (!fromId || fromId === row.dataset.columnId) return;
      const rows = [...colList.querySelectorAll(".view-column-row")];
      const toIndex = rows.findIndex((r) => r.dataset.columnId === row.dataset.columnId);
      reorderViewColumn(view, fromId, toIndex);
      refreshIncluded();
      onChange();
    });
  });
}
