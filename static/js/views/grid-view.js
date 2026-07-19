import { createAutosave } from "../autosave-row.js";
import {
  defaultNewRow,
  entityLinksUrl,
  entityListUrl,
  entityRowUrl,
  displayFieldForEntity,
  itemLabel,
  junctionContainerId,
  linkedEntityId,
  rowLinkData,
} from "../entity-api.js";
import { columnLabel, getViewColumns, reorderViewColumn } from "../view-columns.js";
import { patchSchema } from "../schema-client.js";
import { openChipPicker } from "../widgets/chip-picker.js";
import {
  formatFieldDisplay,
  renderBoxStack,
  renderBulletEditor,
  renderCurrencyInput,
  renderDateInput,
  renderDatetimeInput,
  renderEnumSelect,
  renderNumberInput,
  renderPercentInput,
  renderRatingInput,
  renderTextInput,
} from "../widgets/field-renderers.js";

export async function renderGridView({
  container,
  schema,
  notebookId,
  view: viewProp,
}) {
  container.innerHTML = "<p class='muted'>Loading…</p>";
  try {
    const view = viewProp || schema.views.find((v) => v.type === "grid");
    const entityId = view?.entity;
    if (!entityId) throw new Error("No grid view configured");
    const entity = schema.entity_types[entityId];
    const fields = entity?.fields || {};
    const columns = getViewColumns(view, schema);
    const entityLabel = entity?.label || entityId;
    const containerId = view?.container_entity ? notebookId : null;

    const chipCols = columns.filter((c) => c.source === "join" && c.mode === "chip");
    const linkedCatalogs = {};
    await Promise.all(
      chipCols.map(async (col) => {
        const linkedId = linkedEntityId(schema, col.relationship_id, entityId);
        if (!linkedId || linkedCatalogs[linkedId]) return;
        const linkedView = schema.views?.find((v) => v.entity === linkedId);
        const linkedContainer = linkedView?.container_entity ? notebookId : null;
        const res = await fetch(entityListUrl(linkedId, linkedContainer));
        if (res.ok) linkedCatalogs[linkedId] = await res.json();
      })
    );

    const rowsRes = await fetch(entityListUrl(entityId, containerId));
    if (!rowsRes.ok) throw new Error(`API: HTTP ${rowsRes.status}`);
    const rows = await rowsRes.json();
    if (!Array.isArray(rows)) throw new Error("Unexpected list response");

    container.innerHTML = "";
    const toolbar = document.createElement("div");
    toolbar.className = "view-toolbar";
    const status = document.createElement("span");
    status.className = "save-status";
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-primary";
    addBtn.textContent = `+ ${entityLabel}`;
    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      try {
        const res = await fetch(entityListUrl(entityId, containerId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(defaultNewRow(schema, entityId)),
        });
        if (!res.ok) {
          const detail = await res.text();
          throw new Error(detail || `HTTP ${res.status}`);
        }
        await renderGridView({ container, schema, notebookId, view });
      } catch (err) {
        alert(err.message || "Could not create row.");
      } finally {
        addBtn.disabled = false;
      }
    });
    toolbar.append(addBtn, status);
    container.appendChild(toolbar);

    const onRefresh = () => renderGridView({ container, schema, notebookId, view });
    const saveColumnOrder = async () => {
      try {
        await patchSchema({ views: schema.views });
        document.dispatchEvent(new CustomEvent("schema-views-updated"));
      } catch (err) {
        alert(err.message || "Could not save column order");
      }
    };
    const ctx = {
      schema,
      view,
      entityId,
      entity,
      fields,
      columns,
      notebookId,
      containerId,
      linkedCatalogs,
      onRefresh,
    };

    const tableEl = document.createElement("table");
    tableEl.className = "data-grid data-grid--desktop";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.className = "data-grid-th-sortable";
      th.draggable = true;
      th.dataset.columnId = col.id;
      th.title = "Drag to reorder column";
      th.innerHTML = `<span class="data-grid-th-handle" aria-hidden="true">⋮⋮</span> ${columnLabel(col, schema, view)}`;
      headRow.appendChild(th);
    });
    const actionsTh = document.createElement("th");
    actionsTh.className = "data-grid-actions";
    actionsTh.setAttribute("aria-label", "Actions");
    headRow.appendChild(actionsTh);
    thead.appendChild(headRow);
    enableHeaderColumnDrag(headRow, view, async () => {
      await saveColumnOrder();
      onRefresh();
    });
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    const cardList = document.createElement("div");
    cardList.className = "row-cards row-cards--mobile";

    rows.forEach((row) => {
      const payloads = { ...row };
      const primaryFields = columns
        .filter((c) => c.source === "primary" && c.mode === "edit")
        .map((c) => c.field);

      const autosave = createAutosave({
        debounceMs: 600,
        onSave: async (payload) => {
          const body = {};
          primaryFields.forEach((f) => {
            if (payload[f] !== undefined) body[f] = payload[f];
          });
          const res = await fetch(entityRowUrl(entityId, row.id, containerId), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await res.text());
        },
      });

      const rowCtx = { ...ctx, row, payloads, autosave, status };

      const tr = document.createElement("tr");
      columns.forEach((col) => {
        const td = document.createElement("td");
        appendColumnEditor(td, col, rowCtx);
        tr.appendChild(td);
      });

      const actionsTd = document.createElement("td");
      actionsTd.className = "data-grid-actions";
      actionsTd.appendChild(createDeleteButton(row, rowCtx));
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);

      cardList.appendChild(createRowCard(row, rowCtx));
    });
    tableEl.appendChild(tbody);

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "data-grid-scroll data-grid-scroll--desktop";
    scrollWrap.appendChild(tableEl);
    container.append(scrollWrap, cardList);
  } catch (err) {
    container.innerHTML = `<p class="status error">Failed to load: ${err.message}</p>`;
  }
}

function appendColumnEditor(parent, col, ctx) {
  const { row, fields, payloads, autosave, status, schema, view, entityId, notebookId, containerId, linkedCatalogs, onRefresh } = ctx;

  if (col.source === "join" && col.mode === "chip") {
    parent.appendChild(
      renderChipCell({
        col,
        row,
        schema,
        view,
        entityId,
        notebookId,
        containerId,
        linkedCatalogs,
        onRefresh,
      })
    );
    return;
  }

  if (col.source === "join" && col.field) {
    parent.appendChild(
      renderJoinFieldCell({
        col,
        row,
        schema,
        view,
        entityId,
        notebookId,
        containerId,
        onRefresh,
      })
    );
    return;
  }

  if (col.source !== "primary") return;

  const fdef = fields[col.field] || {};
  if (col.mode === "view") {
    parent.textContent = formatFieldDisplay(row[col.field], fdef);
    return;
  }

  const onChange = (val) => {
    payloads[col.field] = val;
    autosave.scheduleSave(payloads, status);
  };
  appendPrimaryFieldEditor(parent, row[col.field], fdef, onChange);
}

function appendPrimaryFieldEditor(parent, value, fdef, onChange) {
  if (fdef.type === "bullet_list") {
    parent.appendChild(renderBulletEditor(value, onChange));
  } else if (fdef.type === "enum") {
    parent.appendChild(renderEnumSelect(value, fdef.options, onChange));
  } else if (fdef.type === "datetime") {
    parent.appendChild(renderDatetimeInput(value, onChange));
  } else if (fdef.type === "date") {
    parent.appendChild(renderDateInput(value, onChange));
  } else if (fdef.type === "currency") {
    parent.appendChild(renderCurrencyInput(value, onChange, fdef));
  } else if (fdef.type === "percent") {
    parent.appendChild(renderPercentInput(value, onChange));
  } else if (fdef.type === "rating") {
    parent.appendChild(renderRatingInput(value, onChange, fdef));
  } else if (fdef.type === "number" || fdef.type === "integer") {
    parent.appendChild(renderNumberInput(value, onChange));
  } else if (fdef.editor?.widget === "box_stack" || fdef.type === "multiline_text") {
    parent.appendChild(renderBoxStack(value, onChange));
  } else if (fdef.type === "boolean") {
    parent.appendChild(
      renderEnumSelect(value ? "Yes" : "No", ["No", "Yes"], (val) => {
        onChange(val === "Yes" ? 1 : 0);
      })
    );
  } else {
    parent.appendChild(renderTextInput(value, onChange));
  }
}

function createDeleteButton(row, ctx) {
  const { entity, entityId, containerId, onRefresh } = ctx;
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-sm data-grid-delete";
  deleteBtn.setAttribute("aria-label", "Delete row");
  deleteBtn.title = "Delete row";
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", async () => {
    const label = itemLabel(row, entity);
    const prompt = label && label !== row.id ? `Delete “${label}”?` : "Delete this row?";
    if (!confirm(`${prompt}\n\nThis cannot be undone.`)) return;
    deleteBtn.disabled = true;
    try {
      const res = await fetch(entityRowUrl(entityId, row.id, containerId), {
        method: "DELETE",
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `HTTP ${res.status}`);
      }
      await onRefresh();
    } catch (err) {
      alert(err.message || "Could not delete row.");
      deleteBtn.disabled = false;
    }
  });
  return deleteBtn;
}

function createRowCard(row, ctx) {
  const { entity, columns, schema, view } = ctx;
  const card = document.createElement("article");
  card.className = "row-card";

  const title = document.createElement("h3");
  title.className = "row-card-title";
  title.textContent = itemLabel(row, entity) || `Row #${row.id}`;

  const preview = document.createElement("dl");
  preview.className = "row-card-preview";
  columns.slice(0, 3).forEach((col) => {
    const label = columnLabel(col, schema, view);
    let value = "—";
    if (col.source === "primary") {
      const fdef = ctx.fields[col.field] || {};
      value = formatFieldDisplay(row[col.field], fdef) || "—";
    } else if (col.source === "join") {
      const linkData = rowLinkData(row, col.relationship_id);
      value = (linkData.names || []).join(", ") || "—";
    }
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    preview.append(dt, dd);
  });

  const actions = document.createElement("div");
  actions.className = "row-card-actions";
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-sm btn-primary";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openRowSheet(row, ctx));

  const deleteBtn = createDeleteButton(row, ctx);
  deleteBtn.textContent = "Delete";
  deleteBtn.className = "btn btn-sm row-card-delete";

  actions.append(editBtn, deleteBtn);
  card.append(title, preview, actions);
  return card;
}

function openRowSheet(row, ctx) {
  const { schema, view, columns } = ctx;
  const label = itemLabel(row, ctx.entity) || `Row #${row.id}`;

  const backdrop = document.createElement("div");
  backdrop.className = "row-sheet-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const sheet = document.createElement("div");
  sheet.className = "row-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", `Edit ${label}`);

  const handle = document.createElement("div");
  handle.className = "row-sheet-handle";
  handle.setAttribute("aria-hidden", "true");

  const head = document.createElement("header");
  head.className = "row-sheet-head";
  const title = document.createElement("h2");
  title.textContent = label;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn btn-sm row-sheet-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "Done";
  head.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "row-sheet-body";
  const sheetStatus = document.createElement("span");
  sheetStatus.className = "save-status";

  const payloads = { ...row };
  const primaryFields = columns
    .filter((c) => c.source === "primary" && c.mode === "edit")
    .map((c) => c.field);
  const autosave = createAutosave({
    debounceMs: 600,
    onSave: async (payload) => {
      const patchBody = {};
      primaryFields.forEach((f) => {
        if (payload[f] !== undefined) patchBody[f] = payload[f];
      });
      const res = await fetch(
        entityRowUrl(ctx.entityId, row.id, ctx.containerId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        }
      );
      if (!res.ok) throw new Error(await res.text());
    },
  });

  const sheetCtx = {
    ...ctx,
    row,
    payloads,
    autosave,
    status: sheetStatus,
  };

  columns.forEach((col) => {
    const field = document.createElement("label");
    field.className = "row-sheet-field";
    const fieldLabel = document.createElement("span");
    fieldLabel.className = "row-sheet-field-label";
    fieldLabel.textContent = columnLabel(col, schema, view);
    const control = document.createElement("div");
    control.className = "row-sheet-field-control";
    appendColumnEditor(control, col, sheetCtx);
    field.append(fieldLabel, control);
    body.appendChild(field);
  });

  body.appendChild(sheetStatus);
  sheet.append(handle, head, body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  document.body.classList.add("row-sheet-open");

  function close() {
    backdrop.remove();
    document.body.classList.remove("row-sheet-open");
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  closeBtn.focus();
}

function renderChipCell({
  col,
  row,
  schema,
  view,
  entityId,
  notebookId,
  containerId,
  linkedCatalogs,
  onRefresh,
}) {
  const wrap = document.createElement("span");
  const pills = document.createElement("span");
  pills.className = "theme-pills";
  const linkData = rowLinkData(row, col.relationship_id);
  pills.textContent = (linkData.names || []).join(", ") || "—";

  const linkedId = linkedEntityId(schema, col.relationship_id, entityId);
  const linkedEntity = linkedId ? schema.entity_types[linkedId] : null;
  const catalog = linkedId ? linkedCatalogs[linkedId] || [] : [];
  const linkContainer = junctionContainerId(schema, col.relationship_id, notebookId, view);
  const linkedView = schema.views?.find((v) => v.entity === linkedId);

  if (linkedEntity) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-sm";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      openChipPicker({
        title: `${columnLabel(col, schema, view)} — #${row.id}`,
        items: catalog,
        entity: linkedEntity,
        entityId: linkedId,
        containerId: linkedView?.container_entity ? notebookId : null,
        schema,
        selectedIds: linkData.ids,
        onSave: async (linked_ids) => {
          await fetch(entityLinksUrl(entityId, row.id, col.relationship_id, linkContainer), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linked_ids }),
          });
          onRefresh();
        },
      });
    });
    wrap.append(pills, " ", editBtn);
  } else {
    wrap.appendChild(pills);
  }
  return wrap;
}

function renderJoinFieldCell({
  col,
  row,
  schema,
  view,
  entityId,
  notebookId,
  containerId,
  onRefresh,
}) {
  const wrap = document.createElement("span");
  wrap.className = "join-field-cell";
  const linkedId = linkedEntityId(schema, col.relationship_id, entityId);
  const linkedEntity = linkedId ? schema.entity_types[linkedId] : null;
  if (!linkedEntity) {
    wrap.textContent = "—";
    return wrap;
  }

  const linkData = rowLinkData(row, col.relationship_id);
  const linkedView = schema.views?.find((v) => v.entity === linkedId);
  const linkedListContainer = linkedView?.container_entity ? notebookId : null;
  const linkContainer = junctionContainerId(schema, col.relationship_id, notebookId, view);
  const displayField = displayFieldForEntity(linkedEntity);
  const fieldName = col.field || displayField;
  const fdef = linkedEntity.fields?.[fieldName] || {};

  if (col.mode === "view") {
    if (fieldName === displayField) {
      wrap.textContent = (linkData.names || []).join(", ") || "—";
    } else if (linkData.ids?.length === 1) {
      wrap.textContent = "…";
      fetch(entityRowUrl(linkedId, linkData.ids[0], linkedListContainer))
        .then((res) => (res.ok ? res.json() : null))
        .then((linkedRow) => {
          wrap.textContent = linkedRow?.[fieldName] ?? "—";
        })
        .catch(() => {
          wrap.textContent = "—";
        });
    } else {
      wrap.textContent = linkData.ids?.length ? `(${linkData.ids.length})` : "—";
    }
    return wrap;
  }

  if (linkData.ids?.length === 1) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cell-input";
    input.placeholder = fdef.editor?.header || fieldName;
    input.value = fieldName === displayField ? linkData.names[0] || "" : "";
    input.disabled = fieldName !== displayField;

    if (fieldName !== displayField) {
      fetch(entityRowUrl(linkedId, linkData.ids[0], linkedListContainer))
        .then((res) => (res.ok ? res.json() : null))
        .then((linkedRow) => {
          input.value = linkedRow?.[fieldName] ?? "";
          input.disabled = false;
        })
        .catch(() => {
          input.disabled = false;
        });
    }

    input.addEventListener("blur", async () => {
      const previous =
        fieldName === displayField ? linkData.names[0] || "" : input.dataset.loaded;
      if (previous !== undefined && input.value === previous) return;
      await fetch(entityRowUrl(linkedId, linkData.ids[0], linkedListContainer), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: input.value }),
      });
      if (fieldName === displayField) onRefresh();
    });
    input.addEventListener("focus", () => {
      input.dataset.loaded = input.value;
    });
    wrap.appendChild(input);
    return wrap;
  }

  if (linkData.ids?.length > 1 && fieldName === displayField) {
    const names = document.createElement("span");
    names.className = "join-field-names";
    names.textContent = (linkData.names || []).join(", ");
    wrap.appendChild(names);
  } else if (linkData.ids?.length > 1) {
    const count = document.createElement("span");
    count.className = "join-field-names muted";
    count.textContent = `${linkData.ids.length} linked — edit via chips`;
    wrap.appendChild(count);
  }

  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.className = "cell-input join-field-quick-add";
  addInput.placeholder = `+ New ${linkedEntity.label || linkedId}…`;
  async function submitQuickAdd() {
    const name = addInput.value.trim();
    if (!name) return;
    addInput.disabled = true;
    try {
      const body = defaultNewRow(schema, linkedId);
      body[displayField] = name;
      if (fieldName !== displayField) body[fieldName] = name;
      const res = await fetch(entityListUrl(linkedId, linkedListContainer), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      const linked_ids = [...(linkData.ids || []), created.id];
      await fetch(entityLinksUrl(entityId, row.id, col.relationship_id, linkContainer), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_ids }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      addInput.disabled = false;
    }
  }
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuickAdd();
    }
  });
  addInput.addEventListener("blur", () => submitQuickAdd());
  wrap.appendChild(addInput);
  return wrap;
}

function enableHeaderColumnDrag(headRow, view, onReordered) {
  let dragId = null;

  headRow.querySelectorAll(".data-grid-th-sortable").forEach((th) => {
    th.addEventListener("dragstart", (e) => {
      dragId = th.dataset.columnId;
      th.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    });
    th.addEventListener("dragend", () => {
      th.classList.remove("dragging");
      headRow.querySelectorAll(".data-grid-th-sortable").forEach((cell) => {
        cell.classList.remove("drag-over");
      });
      dragId = null;
    });
    th.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (th.dataset.columnId !== dragId) th.classList.add("drag-over");
    });
    th.addEventListener("dragleave", () => th.classList.remove("drag-over"));
    th.addEventListener("drop", async (e) => {
      e.preventDefault();
      th.classList.remove("drag-over");
      const fromId = e.dataTransfer.getData("text/plain") || dragId;
      if (!fromId || fromId === th.dataset.columnId) return;
      const headers = [...headRow.querySelectorAll(".data-grid-th-sortable")];
      const toIndex = headers.findIndex((cell) => cell.dataset.columnId === th.dataset.columnId);
      reorderViewColumn(view, fromId, toIndex);
      await onReordered();
    });
  });
}
