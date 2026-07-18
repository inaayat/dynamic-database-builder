import {
  applySchema,
  getPackages,
  loadPackage,
  validateSchema,
} from "../schema-client.js?v=2";
import { mountBrainstormFlow } from "./brainstorm-flow.js";
import { PAGE_INTRO, helpParagraph } from "./help-text.js";
import { renderStudioItemEditor } from "./item-editor.js";
import { renderStudioWorkspacePanel } from "./studio-workspace-panel.js";
import { renderWorkspaceMap } from "./workspace-map.js";

const MODE_KEY = "designMode";
const MAP_DENSITY_KEY = "designMapDensity";
const MAP_JUNCTION_KEY = "designMapJunctions";
const MAP_VISIBLE_KEY = "designMapVisible";

export function initDesignTab({ mount, getSchema, setSchema, onPreview }) {
  let workingSchema = structuredClone(getSchema());
  let mode = localStorage.getItem(MODE_KEY) || "setup";
  if (mode === "map" || mode === "advanced") mode = "setup";
  let mapDensity = localStorage.getItem(MAP_DENSITY_KEY) || "simple";
  let showJunctionTables = localStorage.getItem(MAP_JUNCTION_KEY) === "true";
  let showMap = localStorage.getItem(MAP_VISIBLE_KEY) === "true";
  let selectedEntityId = Object.keys(workingSchema.entity_types || {})[0] || null;
  let startedBlank = false;
  let brainstormMode = false;
  let brainstormApi = null;
  let mapApi = null;

  const intro = document.createElement("div");
  intro.className = "design-intro";
  intro.innerHTML = `<h2>${PAGE_INTRO.title}</h2>`;
  const workspaceScope = document.createElement("p");
  workspaceScope.className = "design-workspace-scope muted";
  intro.appendChild(workspaceScope);
  intro.appendChild(helpParagraph(PAGE_INTRO.lead));
  intro.appendChild(helpParagraph(PAGE_INTRO.note));
  const howDetails = document.createElement("details");
  howDetails.className = "design-how";
  howDetails.innerHTML = `
    <summary>How Design works</summary>
    <ol class="design-how-list">
      <li><strong>Items</strong> — kinds of records you track</li>
      <li><strong>Fields</strong> — values on an Item, or link to another Item</li>
      <li><strong>Workspace tabs</strong> — layout in Workspace; links show as joins/chips</li>
      <li><strong>Apply Changes</strong> — make it live</li>
    </ol>
  `;
  intro.appendChild(howDetails);

  const toolbar = document.createElement("div");
  toolbar.className = "design-toolbar";

  const packageSelect = document.createElement("select");
  packageSelect.className = "design-package-select";
  packageSelect.innerHTML = "<option value=''>Start from a template…</option>";

  const summaryEl = document.createElement("span");
  summaryEl.className = "design-summary muted";

  const statusEl = document.createElement("span");
  statusEl.className = "design-status muted";

  const validateBtn = document.createElement("button");
  validateBtn.type = "button";
  validateBtn.className = "btn";
  validateBtn.textContent = "Check for problems";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn";
  previewBtn.textContent = "Preview in Workspace";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "btn btn-primary";
  applyBtn.textContent = "Apply Changes";

  const mapToggleBtn = document.createElement("button");
  mapToggleBtn.type = "button";
  mapToggleBtn.className = "btn btn-sm design-map-toggle";
  function syncMapToggleLabel() {
    mapToggleBtn.textContent = showMap ? "Hide map" : "Show map";
    mapToggleBtn.setAttribute("aria-pressed", showMap ? "true" : "false");
  }
  syncMapToggleLabel();
  mapToggleBtn.addEventListener("click", () => {
    showMap = !showMap;
    localStorage.setItem(MAP_VISIBLE_KEY, showMap ? "true" : "false");
    syncMapToggleLabel();
    renderMain();
  });

  toolbar.append(
    packageSelect,
    validateBtn,
    previewBtn,
    mapToggleBtn,
    applyBtn,
    summaryEl,
    statusEl
  );

  const messages = document.createElement("div");
  messages.className = "design-messages";
  messages.hidden = true;

  const main = document.createElement("div");
  main.className = "design-main";

  mount.innerHTML = "";
  mount.append(intro, toolbar, messages, main);

  function updateWorkspaceIntro() {
    const title = workingSchema.site?.title || "Workspace";
    const db = workingSchema.storage?.local_db || "";
    const dbName = db ? db.split("/").pop() : "";
    workspaceScope.textContent = dbName
      ? `Design for “${title}” · ${dbName}`
      : `Design for “${title}”`;
  }

  function onSchemaChange(updated) {
    workingSchema = updated;
    statusEl.textContent = "Unsaved changes";
    updateSummary();
  }

  function updateSummary() {
    const entityCount = Object.keys(workingSchema.entity_types || {}).length;
    const fieldCount = Object.values(workingSchema.entity_types || {}).reduce(
      (n, e) => n + Object.keys(e.fields || {}).length,
      0
    );
    const relCount = (workingSchema.relationships || []).length;
    const viewCount = (workingSchema.views || []).length;
    summaryEl.textContent = `${entityCount} types · ${fieldCount} fields · ${relCount} links · ${viewCount} tabs`;
  }

  function renderMain() {
    updateSummary();
    main.innerHTML = "";
    const entityCount = Object.keys(workingSchema.entity_types || {}).length;
    if (!entityCount && !startedBlank) {
      main.appendChild(renderEmptyState());
      return;
    }

    if (brainstormMode) {
      renderBrainstorm();
      return;
    }

    renderStudio();
  }

  function renderBrainstorm() {
    intro.hidden = true;
    brainstormApi = mountBrainstormFlow({
      container: main,
      baseSchema: workingSchema,
      onSchemaChange(updated) {
        workingSchema = updated;
        onSchemaChange(updated);
      },
      onOpenStudio(updated) {
        brainstormMode = false;
        intro.hidden = false;
        workingSchema = updated;
        selectedEntityId = Object.keys(workingSchema.entity_types || {})[0] || null;
        startedBlank = true;
        onSchemaChange(workingSchema);
        renderMain();
      },
    });
  }

  async function doApply() {
    try {
      statusEl.textContent = "Checking…";
      const toApply = schemaForApi(workingSchema);
      const validation = await validateSchema(toApply);
      if (!validation.valid) {
        showMessages(validation.errors.map((e) => `Error: ${e}`), "error");
        statusEl.textContent = "Fix problems first";
        return;
      }
      const preview = validation.diff;
      if (preview) {
        const summary = formatDiffPreview(preview);
        if (!confirm(`Apply these changes to your workspace?\n\n${summary}`)) {
          statusEl.textContent = "";
          return;
        }
      }
      statusEl.textContent = "Applying…";
      const result = await applySchema(toApply);
      workingSchema = result.schema;
      setSchema(workingSchema);
      showMessages([formatAppliedDiff(result.diff)], "ok");
      statusEl.textContent = "Changes applied";
      renderMain();
    } catch (err) {
      showMessages([formatErrorLine(err)], "error");
      statusEl.textContent = "Could not apply changes";
    }
  }

  function doPreview() {
    setSchema(workingSchema);
    onPreview();
  }

  function renderStudio() {
    const split = document.createElement("div");
    split.className = "design-studio" + (showMap ? " design-studio--map-visible" : "");

    const left = document.createElement("div");
    left.className = "design-studio-left";

    const tabsPanel = document.createElement("div");
    tabsPanel.className = "design-studio-tabs";

    const mapPanel = document.createElement("div");
    mapPanel.className = "design-studio-map";
    mapPanel.hidden = !showMap;

    const mapHead = document.createElement("div");
    mapHead.className = "studio-map-head";
    const mapTitle = document.createElement("strong");
    mapTitle.textContent = "Map";
    const mapControls = document.createElement("div");
    mapControls.className = "studio-map-controls";

    const densitySelect = document.createElement("select");
    densitySelect.className = "erd-density-select";
    densitySelect.innerHTML = `
      <option value="simple">Simple — keys & links</option>
      <option value="full">Full — all fields</option>
    `;
    densitySelect.value = mapDensity;
    densitySelect.addEventListener("change", () => {
      mapDensity = densitySelect.value;
      localStorage.setItem(MAP_DENSITY_KEY, mapDensity);
      bindMap();
    });

    const junctionLabel = document.createElement("label");
    junctionLabel.className = "erd-toggle";
    const junctionCheck = document.createElement("input");
    junctionCheck.type = "checkbox";
    junctionCheck.checked = showJunctionTables;
    junctionCheck.addEventListener("change", () => {
      showJunctionTables = junctionCheck.checked;
      localStorage.setItem(MAP_JUNCTION_KEY, showJunctionTables ? "true" : "false");
      bindMap();
    });
    junctionLabel.append(junctionCheck, document.createTextNode(" Link tables"));

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn-sm";
    resetBtn.textContent = "Reset layout";
    resetBtn.addEventListener("click", () => mapApi?.resetLayout());

    const hideMapBtn = document.createElement("button");
    hideMapBtn.type = "button";
    hideMapBtn.className = "btn btn-sm";
    hideMapBtn.textContent = "Hide map";
    hideMapBtn.addEventListener("click", () => {
      showMap = false;
      localStorage.setItem(MAP_VISIBLE_KEY, "false");
      renderMain();
    });

    mapControls.append(densitySelect, junctionLabel, resetBtn, hideMapBtn);
    mapHead.append(mapTitle, mapControls);

    const mapMount = document.createElement("div");
    mapMount.className = "studio-map-mount";
    mapPanel.append(mapHead, mapMount);

    split.append(left, tabsPanel, mapPanel);
    main.appendChild(split);

    function selectEntity(id) {
      if (selectedEntityId === id) {
        mapApi?.setSelected(id);
        return;
      }
      selectedEntityId = id;
      refreshEditor();
      mapApi?.setSelected(id);
    }

    function onStudioChange(updated, { scope = "all" } = {}) {
      onSchemaChange(updated);
      workingSchema = updated;
      if (!selectedEntityId || !workingSchema.entity_types[selectedEntityId]) {
        selectedEntityId = Object.keys(workingSchema.entity_types || {})[0] || null;
      }
      bindMap();
      if (scope !== "views") refreshEditor();
      if (scope !== "items") refreshTabs();
    }

    function onItemsChange(updated) {
      onStudioChange(updated, { scope: "items" });
    }

    function onViewsChange(updated) {
      onStudioChange(updated, { scope: "views" });
    }

    function refreshEditor() {
      renderStudioItemEditor({
        container: left,
        schema: workingSchema,
        entityId: selectedEntityId,
        onSelectEntity: selectEntity,
        onChange: onItemsChange,
      });
    }

    function refreshTabs() {
      renderStudioWorkspacePanel({
        container: tabsPanel,
        schema: workingSchema,
        onChange: onViewsChange,
        onSelectEntity: selectEntity,
        variant: "sidebar",
      });
    }

    function bindMap() {
      if (!showMap) return;
      mapApi = renderWorkspaceMap({
        container: mapMount,
        schema: workingSchema,
        density: mapDensity,
        showJunctionTables,
        selectedEntityId,
        onSelectEntity: selectEntity,
        onChange: onStudioChange,
      });
    }

    refreshEditor();
    refreshTabs();
    bindMap();
  }

  function renderEmptyState() {
    const empty = document.createElement("div");
    empty.className = "design-empty";
    empty.innerHTML = `<h3>Design this workspace</h3><p class="design-help">This workspace has no Item types yet. Brainstorm what to track, use a template, or open the studio.</p>`;
    const actions = document.createElement("div");
    actions.className = "design-empty-actions";
    const brainstormBtn = document.createElement("button");
    brainstormBtn.type = "button";
    brainstormBtn.className = "btn btn-primary";
    brainstormBtn.textContent = "Brainstorm";
    brainstormBtn.addEventListener("click", () => {
      workingSchema = blankWorkspace(workingSchema);
      startedBlank = true;
      brainstormMode = true;
      selectedEntityId = null;
      onSchemaChange(workingSchema);
      renderMain();
    });
    const templateBtn = document.createElement("button");
    templateBtn.type = "button";
    templateBtn.className = "btn";
    templateBtn.textContent = "Use a template";
    templateBtn.addEventListener("click", async () => {
      try {
        const result = await loadPackage("tagged_knowledge_base");
        workingSchema = result.schema;
        setSchema(workingSchema);
        selectedEntityId = Object.keys(workingSchema.entity_types)[0] || null;
        startedBlank = false;
        brainstormMode = false;
        statusEl.textContent = "Notes template loaded";
        renderMain();
      } catch (err) {
        showMessages([formatErrorLine(err)], "error");
      }
    });
    const studioBtn = document.createElement("button");
    studioBtn.type = "button";
    studioBtn.className = "btn";
    studioBtn.textContent = "Open studio";
    studioBtn.addEventListener("click", () => {
      workingSchema = blankWorkspace(workingSchema);
      startedBlank = true;
      brainstormMode = false;
      selectedEntityId = null;
      onSchemaChange(workingSchema);
      renderMain();
    });
    actions.append(brainstormBtn, templateBtn, studioBtn);
    empty.appendChild(actions);
    return empty;
  }

  async function loadPackages() {
    try {
      const { packages } = await getPackages();
      packageSelect.innerHTML =
        "<option value=''>Start from a template…</option>" +
        packages
          .map((p) => `<option value="${p}">${p.replace(/_/g, " ")}</option>`)
          .join("");
    } catch {
      /* ignore */
    }
  }

  packageSelect.addEventListener("change", async () => {
    const id = packageSelect.value;
    if (!id) return;
    if (!confirm(`Load template “${id.replace(/_/g, " ")}”? This replaces your Design setup.`)) {
      packageSelect.value = "";
      return;
    }
    try {
      const result = await loadPackage(id);
      workingSchema = result.schema;
      setSchema(workingSchema);
      selectedEntityId = Object.keys(workingSchema.entity_types)[0] || null;
      packageSelect.value = "";
      statusEl.textContent = "Template loaded";
      renderMain();
    } catch (err) {
      showMessages([formatErrorLine(err)], "error");
      packageSelect.value = "";
    }
  });

  validateBtn.addEventListener("click", async () => {
    try {
      const result = await validateSchema(schemaForApi(workingSchema));
      const lines = [];
      if (result.errors?.length) lines.push(...result.errors.map((e) => `Error: ${e}`));
      if (result.warnings?.length) lines.push(...result.warnings.map((w) => `Warning: ${w}`));
      if (!lines.length) lines.push("Everything looks good.");
      showMessages(lines, result.valid ? "ok" : "error");
      statusEl.textContent = result.valid ? "Looks good" : "Needs attention";
    } catch (err) {
      showMessages([formatErrorLine(err)], "error");
    }
  });

  previewBtn.addEventListener("click", doPreview);
  applyBtn.addEventListener("click", doApply);

  function showMessages(lines, kind) {
    messages.hidden = false;
    messages.className = "design-messages " + kind;
    messages.innerHTML = lines
      .map((l) => `<div>${escapeHtml(formatErrorLine(l))}</div>`)
      .join("");
  }

  function formatDiffPreview(diff) {
    const parts = [];
    if (diff.new_tables?.length) parts.push(`New tables: ${diff.new_tables.join(", ")}`);
    if (diff.new_columns?.length) {
      parts.push(
        "New fields:\n" + diff.new_columns.map((c) => `  ${c.table}.${c.column}`).join("\n")
      );
    }
    if (diff.warnings?.length) parts.push(...diff.warnings);
    return parts.join("\n") || "Settings only — no database changes.";
  }

  function formatAppliedDiff(diff) {
    if (!diff) return "Your changes are live in Workspace.";
    const cols = diff.new_columns?.length || 0;
    const tables = diff.new_tables?.length || 0;
    if (!cols && !tables) return "Your changes are live in Workspace.";
    return `Applied: ${tables} table(s), ${cols} field(s). Live in Workspace.`;
  }

  loadPackages();
  updateWorkspaceIntro();
  renderMain();

  return {
    reload(schema, { startOver = false, created = false } = {}) {
      workingSchema = structuredClone(schema);
      selectedEntityId = Object.keys(workingSchema.entity_types || {})[0] || null;
      const empty = !Object.keys(workingSchema.entity_types || {}).length;
      if (startOver || created || empty) {
        brainstormMode = false;
        startedBlank = empty;
      }
      statusEl.textContent = "";
      messages.hidden = true;
      intro.hidden = false;
      updateWorkspaceIntro();
      renderMain();
    },
  };
}

function blankWorkspace(current) {
  return {
    schema_version: current.schema_version || "1.1",
    title: current.site?.title || "My Workspace",
    site: {
      ...(current.site || {}),
      id: current.site?.id || "my-workspace",
      title: current.site?.title || "My Workspace",
    },
    storage: current.storage || { local_db: "planning.db" },
    format_conventions: current.format_conventions || { bullet_separator: "\u001e" },
    entity_types: {},
    relationships: [],
    views: [],
    actions: current.actions || [],
    export_profiles: current.export_profiles || {},
    seed: {},
  };
}

/** Drop Design-only markers (e.g. item_link chips) before validate/apply. */
function schemaForApi(schema) {
  const copy = structuredClone(schema);
  delete copy.ui;
  Object.values(copy.entity_types || {}).forEach((ent) => {
    Object.entries(ent.fields || {}).forEach(([k, f]) => {
      if (f.design_only || f.type === "item_link") delete ent.fields[k];
    });
  });
  return copy;
}

function formatErrorLine(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    if (value.data) {
      const detail = value.data.detail || value.data.message || value.data;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") {
              const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
              const msg = item.msg || item.message || JSON.stringify(item);
              return loc ? `${loc}: ${msg}` : msg;
            }
            return String(item);
          })
          .join("; ");
      }
      if (typeof detail === "object") {
        return detail.message || detail.msg || value.message || JSON.stringify(detail);
      }
    }
    return value.message || String(value);
  }
  if (typeof value === "object") {
    return value.message || value.msg || JSON.stringify(value);
  }
  return String(value);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
