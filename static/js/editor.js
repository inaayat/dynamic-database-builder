import { renderCatalogView } from "./views/catalog-view.js";
import { renderGridView } from "./views/grid-view.js";

const NOTEBOOK_ID = "main";

let schema = null;
let activeViewId = null;

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
    renderDesignPanel();
    if (status) status.textContent = "";
  } catch (err) {
    if (status) {
      status.textContent = "Failed to load schema: " + err.message;
      status.classList.add("error");
    }
  }
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

  if (view.type === "grid") {
    await renderGridView({ container: mount, schema, notebookId: NOTEBOOK_ID });
  } else if (view.type === "catalog") {
    await renderCatalogView({
      container: mount,
      schema,
      entityId: view.entity,
      notebookId: NOTEBOOK_ID,
    });
  } else {
    mount.innerHTML = `<p class="muted">View type <code>${view.type}</code> not implemented yet.</p>`;
  }
}

function renderDesignPanel() {
  const summary = document.getElementById("schema-summary");
  const entityList = document.getElementById("entity-list");
  if (!summary || !schema) return;
  summary.innerHTML = `
    <dt>Package</dt><dd>${schema.title || schema.site.id}</dd>
    <dt>Entities</dt><dd>${Object.keys(schema.entity_types).length}</dd>
    <dt>Relationships</dt><dd>${(schema.relationships || []).length}</dd>
    <dt>Views</dt><dd>${(schema.views || []).length}</dd>
  `;
  if (entityList) {
    entityList.innerHTML = Object.entries(schema.entity_types)
      .map(([id, e]) => `<li><code>${id}</code> — ${e.label} <em>(${e.primitive})</em></li>`)
      .join("");
  }
}

loadSchema();
