import { initDesignTab } from "./design/design-tab.js";
import { renderCatalogView } from "./views/catalog-view.js";
import { renderGridView } from "./views/grid-view.js";

let schema = null;
let activeViewId = null;
let designTab = null;

const tabs = document.querySelectorAll(".tab[data-mode]");
const panels = document.querySelectorAll(".panel[data-mode]");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.mode;
    tabs.forEach((t) => {
      const on = t.dataset.mode === mode;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    panels.forEach((p) => p.classList.toggle("active", p.dataset.mode === mode));
  });
});

function getDefaultContainerId() {
  if (!schema) return "main";
  const seed = schema.seed?.notebooks?.[0]?.id;
  if (seed) return seed;
  const container = Object.entries(schema.entity_types || {}).find(
    ([, e]) => e.primitive === "container"
  );
  return container?.[1]?.fields?.id?.default || container?.[0] || "main";
}

function switchToEditTab() {
  tabs.forEach((t) => {
    const on = t.dataset.mode === "edit";
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  panels.forEach((p) => p.classList.toggle("active", p.dataset.mode === "edit"));
}

async function loadSchema() {
  const status = document.getElementById("load-status");
  try {
    const res = await fetch("/api/schema");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    schema = await res.json();

    document.title = schema.site.title + " — Editor";
    document.getElementById("site-title").textContent = schema.site.title;
    document.getElementById("site-meta").textContent =
      `${schema.site.id} · schema ${schema.schema_version}`;

    renderViewTabs();
    initDesign();
    if (status) status.textContent = "";
  } catch (err) {
    if (status) {
      status.textContent = "Failed to load schema: " + err.message;
      status.classList.add("error");
    }
  }
}

function initDesign() {
  const mount = document.getElementById("design-mount");
  if (!mount) return;
  designTab = initDesignTab({
    mount,
    getSchema: () => schema,
    setSchema: (next) => {
      schema = next;
      renderViewTabs();
    },
    onPreview: () => {
      switchToEditTab();
      if (activeViewId) showView(activeViewId);
      else renderViewTabs();
    },
  });
}

function renderViewTabs() {
  const nav = document.getElementById("view-tabs");
  const exportBar = document.getElementById("export-bar");
  if (!nav || !schema) return;
  nav.innerHTML = "";

  schema.views.forEach((view, i) => {
    const btn = document.createElement("button");
    btn.className = "view-tab" + (i === 0 ? " active" : "");
    btn.textContent = view.label;
    btn.dataset.viewId = view.id;
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showView(view.id);
    });
    nav.appendChild(btn);
  });

  if (exportBar) {
    exportBar.innerHTML = "";
    const jsonBtn = document.createElement("a");
    jsonBtn.href = "/api/export/json.zip";
    jsonBtn.className = "btn btn-sm";
    jsonBtn.textContent = "Export JSON";
    jsonBtn.download = "export.zip";
    const xlsxBtn = document.createElement("a");
    xlsxBtn.href = "/api/export/xlsx";
    xlsxBtn.className = "btn btn-sm";
    xlsxBtn.textContent = "Export XLSX";
    xlsxBtn.download = "export.xlsx";
    exportBar.append(jsonBtn, xlsxBtn);
  }

  if (schema.views.length) showView(schema.views[0].id);
}

async function showView(viewId) {
  activeViewId = viewId;
  const mount = document.getElementById("view-mount");
  const view = schema.views.find((v) => v.id === viewId);
  if (!mount || !view) return;

  const notebookId = getDefaultContainerId();

  if (view.type === "grid") {
    await renderGridView({ container: mount, schema, notebookId, view });
  } else if (view.type === "catalog") {
    await renderCatalogView({
      container: mount,
      schema,
      entityId: view.entity,
      notebookId,
    });
  } else {
    mount.innerHTML = `<p class="muted">View type <code>${view.type}</code> not implemented yet.</p>`;
  }
}

loadSchema();
