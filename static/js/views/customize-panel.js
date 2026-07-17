/** Workspace Customize side panel — tab layout without full Design. */

import { promptAddInfo, updateViewLabel } from "../design/design-actions.js";
import { renderViewJoinsAndColumns } from "../design/view-tab-editor.js";
import { applySchema, patchSchema } from "../schema-client.js";
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

    const addFieldBtn = document.createElement("button");
    addFieldBtn.type = "button";
    addFieldBtn.className = "btn btn-sm";
    addFieldBtn.textContent = "+ Add field to primary Item";
    addFieldBtn.addEventListener("click", async () => {
      const result = await promptAddInfo(schema, view.entity);
      if (!result || result.error) return;
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

  async function saveViews(schema) {
    const data = await patchSchema({ views: schema.views });
    setSchema(data.schema);
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
