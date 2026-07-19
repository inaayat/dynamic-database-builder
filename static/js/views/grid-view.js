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
import { columnLabel, getViewColumns } from "../view-columns.js";
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

    const tableEl = document.createElement("table");
    tableEl.className = "data-grid";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML =
      columns.map((c) => `<th>${columnLabel(c, schema, view)}</th>`).join("") +
      '<th class="data-grid-actions" aria-label="Actions"></th>';
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
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

      columns.forEach((col) => {
        const td = document.createElement("td");
        if (col.source === "join" && col.mode === "chip") {
          td.appendChild(
            renderChipCell({
              col,
              row,
              schema,
              view,
              entityId,
              notebookId,
              containerId,
              linkedCatalogs,
              onRefresh: () => renderGridView({ container, schema, notebookId, view }),
            })
          );
        } else if (col.source === "join" && col.field) {
          td.appendChild(
            renderJoinFieldCell({
              col,
              row,
              schema,
              view,
              entityId,
              notebookId,
              containerId,
              onRefresh: () => renderGridView({ container, schema, notebookId, view }),
            })
          );
        } else if (col.source === "primary") {
          const fdef = fields[col.field] || {};
          if (col.mode === "view") {
            td.textContent = formatFieldDisplay(row[col.field], fdef);
          } else {
            const onChange = (val) => {
              payloads[col.field] = val;
              autosave.scheduleSave(payloads, status);
            };
            if (fdef.type === "bullet_list") {
              td.appendChild(renderBulletEditor(row[col.field], onChange));
            } else if (fdef.type === "enum") {
              td.appendChild(renderEnumSelect(row[col.field], fdef.options, onChange));
            } else if (fdef.type === "datetime") {
              td.appendChild(renderDatetimeInput(row[col.field], onChange));
            } else if (fdef.type === "date") {
              td.appendChild(renderDateInput(row[col.field], onChange));
            } else if (fdef.type === "currency") {
              td.appendChild(renderCurrencyInput(row[col.field], onChange, fdef));
            } else if (fdef.type === "percent") {
              td.appendChild(renderPercentInput(row[col.field], onChange));
            } else if (fdef.type === "rating") {
              td.appendChild(renderRatingInput(row[col.field], onChange, fdef));
            } else if (fdef.type === "number" || fdef.type === "integer") {
              td.appendChild(renderNumberInput(row[col.field], onChange));
            } else if (fdef.editor?.widget === "box_stack" || fdef.type === "multiline_text") {
              td.appendChild(renderBoxStack(row[col.field], onChange));
            } else if (fdef.type === "boolean") {
              td.appendChild(
                renderEnumSelect(row[col.field] ? "Yes" : "No", ["No", "Yes"], (val) => {
                  onChange(val === "Yes" ? 1 : 0);
                })
              );
            } else {
              td.appendChild(renderTextInput(row[col.field], onChange));
            }
          }
        }
        tr.appendChild(td);
      });

      const actionsTd = document.createElement("td");
      actionsTd.className = "data-grid-actions";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-sm data-grid-delete";
      deleteBtn.setAttribute("aria-label", "Delete row");
      deleteBtn.title = "Delete row";
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", async () => {
        const label = itemLabel(row, entity);
        const prompt = label && label !== row.id
          ? `Delete “${label}”?`
          : "Delete this row?";
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
          await renderGridView({ container, schema, notebookId, view });
        } catch (err) {
          alert(err.message || "Could not delete row.");
          deleteBtn.disabled = false;
        }
      });
      actionsTd.appendChild(deleteBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "data-grid-scroll";
    scrollWrap.appendChild(tableEl);
    container.appendChild(scrollWrap);
  } catch (err) {
    container.innerHTML = `<p class="status error">Failed to load: ${err.message}</p>`;
  }
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
