import {
  applySchema,
  getPackages,
  loadPackage,
  validateSchema,
} from "../schema-client.js";
import { renderConnectionPanel } from "./connection-panel.js";
import { renderEntityPanel } from "./entity-panel.js";
import { renderInspector } from "./inspector.js";

export function initDesignTab({ mount, getSchema, setSchema, onPreview }) {
  let workingSchema = structuredClone(getSchema());
  let selection = { type: "none" };
  let entityPanel;
  let connectionPanel;

  const toolbar = document.createElement("div");
  toolbar.className = "design-toolbar";

  const packageSelect = document.createElement("select");
  packageSelect.className = "design-package-select";
  packageSelect.innerHTML = "<option value=''>Package…</option>";

  const statusEl = document.createElement("span");
  statusEl.className = "design-status muted";

  const validateBtn = document.createElement("button");
  validateBtn.type = "button";
  validateBtn.className = "btn";
  validateBtn.textContent = "Validate schema";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn";
  previewBtn.textContent = "Preview in Edit";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "btn btn-primary";
  applyBtn.textContent = "Apply & migrate DB";

  toolbar.append(packageSelect, validateBtn, previewBtn, applyBtn, statusEl);

  const layout = document.createElement("div");
  layout.className = "design-layout";

  const colEntities = document.createElement("div");
  colEntities.className = "design-col";
  const colConnections = document.createElement("div");
  colConnections.className = "design-col";
  const colInspector = document.createElement("div");
  colInspector.className = "design-col design-col-inspector";

  layout.append(colEntities, colConnections, colInspector);

  const messages = document.createElement("div");
  messages.className = "design-messages";
  messages.hidden = true;

  mount.innerHTML = "";
  mount.append(toolbar, messages, layout);

  function onSchemaChange(updated) {
    workingSchema = updated;
    statusEl.textContent = "Unsaved changes";
  }

  function onSelect(sel) {
    selection = sel;
    renderInspector({
      container: colInspector,
      selection,
      schema: workingSchema,
      onChange: onSchemaChange,
    });
  }

  function refreshPanels() {
    entityPanel = renderEntityPanel({
      container: colEntities,
      schema: workingSchema,
      onChange: onSchemaChange,
      onSelect,
    });
    connectionPanel = renderConnectionPanel({
      container: colConnections,
      schema: workingSchema,
      onChange: onSchemaChange,
      onSelect,
    });
    onSelect(selection);
  }

  async function loadPackages() {
    try {
      const { packages } = await getPackages();
      packageSelect.innerHTML =
        "<option value=''>Package…</option>" +
        packages
          .map((p) => `<option value="${p}">${p}</option>`)
          .join("");
    } catch {
      /* ignore */
    }
  }

  packageSelect.addEventListener("change", async () => {
    const id = packageSelect.value;
    if (!id) return;
    if (!confirm(`Load package "${id}"? This replaces the active schema.`)) {
      packageSelect.value = "";
      return;
    }
    try {
      statusEl.textContent = "Loading package…";
      const result = await loadPackage(id);
      workingSchema = result.schema;
      setSchema(workingSchema);
      statusEl.textContent = `Loaded ${id}`;
      packageSelect.value = "";
      refreshPanels();
    } catch (err) {
      statusEl.textContent = "";
      showMessages([err.message], "error");
      packageSelect.value = "";
    }
  });

  validateBtn.addEventListener("click", async () => {
    try {
      statusEl.textContent = "Validating…";
      const result = await validateSchema(workingSchema);
      const lines = [];
      if (result.errors?.length) lines.push(...result.errors.map((e) => `Error: ${e}`));
      if (result.warnings?.length) lines.push(...result.warnings.map((w) => `Warning: ${w}`));
      if (!lines.length) lines.push("Schema is valid.");
      showMessages(lines, result.valid ? "ok" : "error");
      statusEl.textContent = result.valid ? "Valid" : "Validation failed";
    } catch (err) {
      showMessages([err.message], "error");
      statusEl.textContent = "";
    }
  });

  previewBtn.addEventListener("click", () => {
    setSchema(workingSchema);
    onPreview();
  });

  applyBtn.addEventListener("click", async () => {
    try {
      statusEl.textContent = "Checking migration…";
      const validation = await validateSchema(workingSchema);
      if (!validation.valid) {
        showMessages(validation.errors.map((e) => `Error: ${e}`), "error");
        statusEl.textContent = "Fix errors first";
        return;
      }

      const preview = validation.diff;
      if (preview) {
        const summary = formatDiffPreview(preview);
        if (!confirm(`Apply migration?\n\n${summary}`)) return;
      }

      statusEl.textContent = "Applying…";
      const result = await applySchema(workingSchema);
      workingSchema = result.schema;
      setSchema(workingSchema);
      showMessages([formatAppliedDiff(result.diff)], "ok");
      statusEl.textContent = "Applied";
      refreshPanels();
    } catch (err) {
      if (err.status === 409 && err.data?.diff) {
        showMessages(
          [
            err.data.message || "Destructive changes blocked",
            formatDiffPreview(err.data.diff),
          ],
          "error"
        );
      } else {
        showMessages([err.message], "error");
      }
      statusEl.textContent = "Apply failed";
    }
  });

  function showMessages(lines, kind) {
    messages.hidden = false;
    messages.className = "design-messages " + kind;
    messages.innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
  }

  function formatDiffPreview(diff) {
    const parts = [];
    if (diff.new_tables?.length) parts.push(`New tables: ${diff.new_tables.join(", ")}`);
    if (diff.new_columns?.length) {
      parts.push(
        "New columns:\n" +
          diff.new_columns.map((c) => `  ${c.table}.${c.column}`).join("\n")
      );
    }
    if (diff.removed_tables?.length) {
      parts.push(`Removed tables: ${diff.removed_tables.join(", ")}`);
    }
    if (diff.removed_columns?.length) {
      parts.push(`Removed columns: ${diff.removed_columns.length}`);
    }
    if (diff.warnings?.length) parts.push(...diff.warnings);
    return parts.join("\n") || "No schema changes detected.";
  }

  function formatAppliedDiff(diff) {
    if (!diff) return "Schema applied.";
    const cols = diff.new_columns?.length || 0;
    const tables = diff.new_tables?.length || 0;
    return `Applied: ${tables} table(s), ${cols} column(s) added.`;
  }

  loadPackages();
  refreshPanels();

  return {
    reload(schema) {
      workingSchema = structuredClone(schema);
      selection = { type: "none" };
      statusEl.textContent = "";
      messages.hidden = true;
      refreshPanels();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
