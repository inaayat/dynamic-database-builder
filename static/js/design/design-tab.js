import {
  applySchema,
  validateSchema,
} from "../schema-client.js?v=2";
import { mountBrainstormFlow } from "./brainstorm-flow.js";
import { importSchemaToBrainstormState } from "./brainstorm.js";
import { PAGE_INTRO, helpParagraph } from "./help-text.js";

export function initDesignTab({ mount, getSchema, setSchema, onPreview }) {
  let workingSchema = structuredClone(getSchema());
  let startedBlank = false;
  let brainstormMode = false;
  let brainstormApi = null;

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

  toolbar.append(validateBtn, previewBtn, applyBtn, summaryEl, statusEl);

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
    if (!entityCount && !startedBlank && !brainstormMode) {
      main.appendChild(renderEmptyState());
      return;
    }

    if (brainstormMode || (!entityCount && startedBlank)) {
      renderBrainstorm();
      return;
    }

    renderConfiguredState();
  }

  function renderBrainstorm() {
    intro.hidden = true;
    const entityCount = Object.keys(workingSchema.entity_types || {}).length;
    const initialState =
      entityCount > 0 ? importSchemaToBrainstormState(workingSchema) : undefined;
    brainstormApi = mountBrainstormFlow({
      container: main,
      baseSchema: workingSchema,
      initialState,
      onSchemaChange(updated) {
        workingSchema = updated;
        onSchemaChange(updated);
      },
      onApply: async () => {
        const applied = await doApply();
        if (applied) {
          brainstormMode = false;
          startedBlank = false;
          intro.hidden = false;
          renderMain();
        }
      },
    });
  }

  function renderConfiguredState() {
    intro.hidden = false;
    const panel = document.createElement("div");
    panel.className = "design-configured";

    const heading = document.createElement("h3");
    heading.textContent = "Workspace is set up";
    panel.appendChild(heading);

    const hint = document.createElement("p");
    hint.className = "design-help";
    hint.textContent =
      "Edit the full design below, or fine-tune tabs and columns in Workspace → Customize.";
    panel.appendChild(hint);

    const actions = document.createElement("div");
    actions.className = "design-configured-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-primary";
    editBtn.textContent = "Edit design";
    editBtn.addEventListener("click", () => {
      brainstormMode = true;
      intro.hidden = true;
      statusEl.textContent = "";
      messages.hidden = true;
      renderMain();
    });
    const customizeHint = document.createElement("span");
    customizeHint.className = "muted design-configured-hint";
    customizeHint.textContent = "Start over in the sidebar resets everything.";
    actions.append(editBtn, customizeHint);
    panel.appendChild(actions);

    const list = document.createElement("ul");
    list.className = "design-configured-list";
    Object.values(workingSchema.entity_types || {}).forEach((ent) => {
      const li = document.createElement("li");
      const fields = Object.entries(ent.fields || {})
        .filter(([k, f]) => k !== "id" && f.type !== "foreign_key")
        .map(([k, f]) => f.editor?.header || k);
      li.innerHTML = `<strong>${escapeHtml(ent.label)}</strong> <span class="muted">${escapeHtml(fields.join(", ") || "title")}</span>`;
      list.appendChild(li);
    });
    if (!list.children.length) {
      list.innerHTML = "<li class='muted'>No record types yet.</li>";
    }
    panel.appendChild(list);
    main.appendChild(panel);
  }

  async function doApply() {
    try {
      statusEl.textContent = "Checking…";
      const toApply = schemaForApi(workingSchema);
      const validation = await validateSchema(toApply);
      if (!validation.valid) {
        showMessages(validation.errors.map((e) => `Error: ${e}`), "error");
        statusEl.textContent = "Fix problems first";
        return false;
      }
      const preview = validation.diff;
      if (preview) {
        const summary = formatDiffPreview(preview);
        if (!confirm(`Apply these changes to your workspace?\n\n${summary}`)) {
          statusEl.textContent = "";
          return false;
        }
      }
      statusEl.textContent = "Applying…";
      const result = await applySchema(toApply);
      workingSchema = result.schema;
      setSchema(workingSchema);
      showMessages([formatAppliedDiff(result.diff)], "ok");
      statusEl.textContent = "Changes applied";
      return true;
    } catch (err) {
      showMessages([formatErrorLine(err)], "error");
      statusEl.textContent = "Could not apply changes";
      return false;
    }
  }

  function doPreview() {
    setSchema(workingSchema);
    onPreview();
  }

  function renderEmptyState() {
    const empty = document.createElement("div");
    empty.className = "design-empty";
    empty.innerHTML = `<h3>Design this workspace</h3><p class="design-help">This workspace has no Item types yet. Brainstorm what to track to get started.</p>`;
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
      intro.hidden = true;
      onSchemaChange(workingSchema);
      renderMain();
    });
    actions.append(brainstormBtn);
    empty.appendChild(actions);
    return empty;
  }

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
  applyBtn.addEventListener("click", async () => {
    const applied = await doApply();
    if (applied) renderMain();
  });

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

  updateWorkspaceIntro();
  renderMain();

  return {
    reload(schema, { startOver = false, created = false, deleted = false } = {}) {
      workingSchema = structuredClone(schema);
      const empty = !Object.keys(workingSchema.entity_types || {}).length;
      if (startOver || created || empty) {
        brainstormMode = true;
        startedBlank = true;
        intro.hidden = true;
      } else if (deleted) {
        brainstormMode = false;
        startedBlank = false;
        intro.hidden = false;
      } else {
        brainstormMode = false;
        startedBlank = false;
        intro.hidden = false;
      }
      statusEl.textContent = "";
      messages.hidden = true;
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
