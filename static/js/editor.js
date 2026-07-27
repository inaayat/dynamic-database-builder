import { mountAppWorkspaceBar } from "./app-workspaces.js";
import { initDesignTab } from "./design/design-tab.js";
import { noticeModal } from "./design/modals.js";
import {
  isSchemaEmpty,
  phaseCopy,
  preferredModeForSchema,
  workspacePhase,
} from "./journey.js";
import { mountCustomizePanel } from "./views/customize-panel.js";
import { renderGridView } from "./views/grid-view.js";
import { ensureViewShape } from "./view-columns.js";
import {
  getContainerEntityId,
  loadStoredWorkspaceId,
  mountWorkspacePicker,
  storeWorkspaceId,
} from "./workspace-picker.js";

let schema = null;
let activeViewId = null;
let activeWorkspaceId = null;
let designTab = null;
let customizePanel = null;
let workspacePickerApi = null;
let appWorkspaceBar = null;

const tabs = document.querySelectorAll(".tab[data-mode]");
const panels = document.querySelectorAll(".panel[data-mode]");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

function switchMode(mode) {
  if (mode === "edit" && isSchemaEmpty(schema)) {
    renderBrowseGate(true);
    mode = "edit";
  } else {
    renderBrowseGate(false);
  }

  tabs.forEach((t) => {
    const on = t.dataset.mode === mode;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
    if (t.dataset.mode === "edit") {
      t.classList.toggle("is-locked", isSchemaEmpty(schema));
      t.title = isSchemaEmpty(schema)
        ? "Finish Setup first"
        : "Browse and edit records";
    }
  });
  panels.forEach((p) => p.classList.toggle("active", p.dataset.mode === mode));
  updateJourneyChip();
}

function getDefaultContainerId() {
  if (!schema) return "main";
  const seed = schema.seed?.notebooks?.[0]?.id;
  if (seed) return seed;
  const container = getContainerEntityId(schema);
  return container || "main";
}

function getActiveWorkspaceId() {
  return activeWorkspaceId || getDefaultContainerId();
}

function updateHeaderMeta() {
  if (!schema) return;
  const phase = workspacePhase(schema);
  const copy = phaseCopy(phase);
  document.title = `${schema.site.title} — ${phase === "setup" ? "Setup" : "Browse"}`;
  const titleEl = document.getElementById("site-title");
  const db = schema.storage?.local_db || "data.db";
  const dbName = db.split("/").pop();
  const meta = `${schema.site.id} · schema ${schema.schema_version} · ${dbName}`;
  titleEl.textContent = schema.site.title;
  titleEl.title = meta;
  const metaEl = document.getElementById("site-meta");
  if (metaEl) metaEl.textContent = meta;
  updateJourneyChip(copy);
}

function updateJourneyChip(copy) {
  const chip = document.getElementById("journey-chip");
  if (!chip || !schema) return;
  const phase = copy || phaseCopy(workspacePhase(schema));
  chip.hidden = false;
  chip.dataset.phase = phase.id;
  chip.textContent = phase.label;
  chip.title = phase.hint;
}

function renderBrowseGate(show) {
  const gate = document.getElementById("browse-gate");
  const layout = document.querySelector("#panel-edit .workspace-layout");
  if (!gate || !layout) return;
  gate.hidden = !show;
  layout.hidden = show;
  if (!show) {
    gate.innerHTML = "";
    return;
  }
  gate.innerHTML = "";
  gate.className = "browse-gate";

  const title = document.createElement("h2");
  title.textContent = "Finish Setup first";
  const lead = document.createElement("p");
  lead.className = "browse-gate-lead";
  lead.textContent =
    "This workspace has no record types yet. Brainstorm what you track in Setup, then come back here to add records.";
  const cta = document.createElement("button");
  cta.type = "button";
  cta.className = "btn btn-primary";
  cta.textContent = "Go to Setup";
  cta.addEventListener("click", () => switchMode("design"));
  gate.append(title, lead, cta);
}

function switchToBrowse() {
  switchMode("edit");
}

async function initWorkspacePicker() {
  const mount = document.getElementById("workspace-picker");
  if (!mount || !schema) return;
  if (!getContainerEntityId(schema)) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  mount.hidden = false;
  const siteId = schema.site?.id || "default";
  activeWorkspaceId = loadStoredWorkspaceId(siteId) || getDefaultContainerId();

  try {
    workspacePickerApi = await mountWorkspacePicker({
      mount,
      schema,
      getActiveId: () => getActiveWorkspaceId(),
      onSelect: (id) => {
        activeWorkspaceId = id;
        storeWorkspaceId(siteId, id);
        if (activeViewId) showView(activeViewId);
      },
    });
  } catch (err) {
    console.error("Workspace picker failed:", err);
    mount.hidden = true;
  }
}

async function applyWorkspacePayload(
  data,
  { startOver = false, created = false, deleted = false } = {}
) {
  schema = data.schema;
  activeViewId = null;
  activeWorkspaceId = null;
  updateHeaderMeta();
  await appWorkspaceBar?.refresh();
  await initWorkspacePicker();
  renderViewTabs(true);
  if (designTab) {
    designTab.reload(schema, { startOver, created, deleted });
  } else {
    initDesign();
  }
  const mode = preferredModeForSchema(schema, {
    forceSetup: startOver || created,
  });
  switchMode(mode);
}

function initAppWorkspaceBar() {
  const mount = document.getElementById("app-workspace-sidebar");
  if (!mount) return;
  appWorkspaceBar = mountAppWorkspaceBar({
    mount,
    variant: "sidebar",
    onChange: applyWorkspacePayload,
  });
}

async function loadSchema() {
  const status = document.getElementById("load-status");
  try {
    const res = await fetch("/api/schema");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    schema = await res.json();

    updateHeaderMeta();
    initAppWorkspaceBar();
    await initWorkspacePicker();
    renderViewTabs();
    initCustomizePanel();
    try {
      initDesign();
    } catch (err) {
      if (status) {
        status.textContent = "Setup failed to load: " + err.message;
        status.classList.add("error");
      }
    }
    switchMode(preferredModeForSchema(schema));
    if (status && !status.classList.contains("error")) status.textContent = "";
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
      updateHeaderMeta();
      renderViewTabs(false);
    },
    onPreview: () => {
      switchToBrowse();
      if (activeViewId) showView(activeViewId);
      else renderViewTabs();
    },
    onApplied: () => {
      updateHeaderMeta();
      switchToBrowse();
      if (activeViewId) showView(activeViewId);
      else renderViewTabs();
    },
  });
}

function initCustomizePanel() {
  const panelEl = document.getElementById("customize-panel");
  const btn = document.getElementById("customize-btn");
  if (!panelEl || !btn) return;
  customizePanel = mountCustomizePanel({
    panelEl,
    getSchema: () => schema,
    setSchema: (next) => {
      schema = next;
      updateHeaderMeta();
      renderViewTabs(false);
    },
    getActiveViewId: () => activeViewId,
    onViewRefresh: () => {
      if (activeViewId) showView(activeViewId);
    },
  });
  btn.addEventListener("click", () => {
    if (customizePanel.isOpen()) customizePanel.close();
    else customizePanel.open();
  });
  document.addEventListener("schema-views-updated", () => renderViewTabs(false));
}

function renderViewTabs(switchToFirst = true) {
  const nav = document.getElementById("view-tabs");
  const exportBar = document.getElementById("export-bar");
  if (!nav || !schema) return;
  nav.innerHTML = "";

  (schema.views || []).forEach((view, i) => {
    const btn = document.createElement("button");
    btn.className =
      "view-tab" +
      ((switchToFirst && i === 0) || view.id === activeViewId ? " active" : "");
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
    async function downloadExport(path, filename) {
      const res = await fetch(path);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    const jsonBtn = document.createElement("button");
    jsonBtn.type = "button";
    jsonBtn.className = "btn btn-sm";
    jsonBtn.textContent = "Export JSON";
    jsonBtn.addEventListener("click", async () => {
      try {
        await downloadExport("/api/export/json.zip", "export.zip");
      } catch (err) {
        await noticeModal({
          title: "Export failed",
          message: err.message || "Export failed",
        });
      }
    });
    const xlsxBtn = document.createElement("button");
    xlsxBtn.type = "button";
    xlsxBtn.className = "btn btn-sm";
    xlsxBtn.textContent = "Export XLSX";
    xlsxBtn.addEventListener("click", async () => {
      try {
        await downloadExport("/api/export/xlsx", "export.xlsx");
      } catch (err) {
        await noticeModal({
          title: "Export failed",
          message: err.message || "Export failed",
        });
      }
    });
    exportBar.append(jsonBtn, xlsxBtn);
  }

  if (schema.views?.length && switchToFirst) showView(schema.views[0].id);
  else if (activeViewId) showView(activeViewId);
  if (customizePanel?.isOpen()) customizePanel.refresh();
}

async function showView(viewId) {
  activeViewId = viewId;
  const mount = document.getElementById("view-mount");
  const view = schema.views.find((v) => v.id === viewId);
  if (!mount || !view) return;

  const notebookId = getActiveWorkspaceId();
  ensureViewShape(view, schema);
  await renderGridView({ container: mount, schema, notebookId, view });
}

loadSchema();
