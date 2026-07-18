/** Workspace Customize side panel — tab layout without full Design. */

import {
  FIELD_CATALOG,
  friendlyFieldType,
  promptAddInfo,
  updateFieldLabel,
  updateFieldType,
  updateViewLabel,
} from "../design/design-actions.js";
import { renderViewJoinsAndColumns } from "../design/view-tab-editor.js";
import { isPrimaryKey } from "../design/field-presets.js";
import { applySchema, patchSchema } from "../schema-client.js?v=2";
import { ensureViewShape } from "../view-columns.js";

export function mountCustomizePanel({
  panelEl,
  getSchema,
  setSchema,
  getActiveViewId,
  onViewRefresh,
}) {
  let open = false;

  function close() {
    open = false;
    panelEl.hidden = true;
  }

  function render() {
    const schema = getSchema();
    const viewId = getActiveViewId();
    const view = schema?.views?.find((v) => v.id === viewId);
    panelEl.innerHTML = "";
    if (!view) {
      panelEl.innerHTML = "<p class='muted'>Select a tab to customize.</p>";
      return;
    }
    ensureViewShape(view, schema);

    const head = document.createElement("div");
    head.className = "customize-head";
    head.innerHTML = "<h3>Customize tab</h3>";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-sm";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", close);
    head.appendChild(closeBtn);
    panelEl.appendChild(head);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ie-input";
    nameInput.value = view.label || "";
    nameInput.placeholder = "Tab name";
    nameInput.addEventListener("change", async () => {
      updateViewLabel(view, nameInput.value);
      await saveViews(schema);
      refreshTabs();
    });
    panelEl.appendChild(nameInput);

    panelEl.appendChild(
      renderViewJoinsAndColumns(view, schema, async () => {
        await saveViews(schema);
        onViewRefresh();
        render();
      })
    );

    panelEl.appendChild(renderPrimaryFieldEditor(schema, view));

    const addFieldBtn = document.createElement("button");
    addFieldBtn.type = "button";
    addFieldBtn.className = "btn btn-sm";
    addFieldBtn.textContent = "+ Add field to primary Item";
    addFieldBtn.addEventListener("click", async () => {
      const result = await promptAddInfo(schema, view.entity);
      if (!result || result.error) {
        if (result?.error) alert(result.error);
        return;
      }
      try {
        const data = await applySchema(schema);
        setSchema(data.schema);
        onViewRefresh();
        render();
      } catch (err) {
        alert(err.message);
      }
    });
    panelEl.appendChild(addFieldBtn);
  }

  function renderPrimaryFieldEditor(schema, view) {
    const wrap = document.createElement("div");
    wrap.className = "customize-field-edit";
    wrap.innerHTML =
      "<span class='view-config-label'>Edit primary fields</span>" +
      "<p class='muted view-config-hint'>Rename or change type for fields on this tab’s Item.</p>";

    const entity = schema.entity_types[view.entity];
    if (!entity) return wrap;

    const primaryCols = (view.columns || []).filter(
      (c) => c.source === "primary" && c.field && entity.fields?.[c.field]
    );
    if (!primaryCols.length) {
      wrap.appendChild(Object.assign(document.createElement("p"), {
        className: "muted",
        textContent: "No primary columns on this tab yet.",
      }));
      return wrap;
    }

    primaryCols.forEach((col) => {
      const field = entity.fields[col.field];
      if (!field || field.design_only || isPrimaryKey(entity, col.field)) return;
      if (field.type === "item_link" || field.type === "foreign_key") return;

      const row = document.createElement("div");
      row.className = "customize-field-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "ie-input";
      nameInput.value = field.editor?.header || col.field;
      nameInput.title = "Field label";
      nameInput.addEventListener("change", async () => {
        updateFieldLabel(entity, col.field, nameInput.value);
        try {
          const data = await applySchema(schema);
          setSchema(data.schema);
          onViewRefresh();
          render();
        } catch (err) {
          alert(err.message);
        }
      });

      const typeSel = document.createElement("select");
      typeSel.className = "ie-input ie-field-type-select";
      FIELD_CATALOG.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.type;
        option.textContent = opt.label;
        option.selected = field.type === opt.type;
        typeSel.appendChild(option);
      });
      if (!FIELD_CATALOG.some((f) => f.type === field.type)) {
        const option = document.createElement("option");
        option.value = field.type;
        option.textContent = friendlyFieldType(field.type);
        option.selected = true;
        typeSel.appendChild(option);
      }
      typeSel.addEventListener("change", async () => {
        const result = updateFieldType(entity, col.field, typeSel.value);
        if (result?.error) {
          alert(result.error);
          typeSel.value = field.type;
          return;
        }
        try {
          const data = await applySchema(schema);
          setSchema(data.schema);
          onViewRefresh();
          render();
        } catch (err) {
          alert(err.message);
        }
      });

      row.append(nameInput, typeSel);
      wrap.appendChild(row);
    });

    return wrap;
  }

  async function saveViews(schema) {
    try {
      const data = await patchSchema({ views: schema.views });
      setSchema(data.schema);
    } catch (err) {
      alert(err.message || "Failed to save tab layout");
      throw err;
    }
  }

  function refreshTabs() {
    document.dispatchEvent(new CustomEvent("schema-views-updated"));
  }

  return {
    open() {
      open = true;
      panelEl.hidden = false;
      render();
    },
    close,
    isOpen: () => open,
    refresh: render,
  };
}
