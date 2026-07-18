/** Guided setup wizard: Items → Info → Views → Apply. */

import {
  isPrimaryKey,
} from "./field-presets.js";
import {
  FIELD_HELP,
  PANEL_HELP,
  storageLabel,
  helpParagraph,
} from "./help-text.js";
import { createView, promptAddInfo, promptAddItem, removeField } from "./design-actions.js";
import { openModal } from "./modals.js";

const STEPS = [
  { id: "entities", label: "1. Items", short: "What you track" },
  { id: "fields", label: "2. Info", short: "Values & links" },
  { id: "views", label: "3. Views", short: "How you look at them" },
  { id: "apply", label: "4. Apply", short: "Make it live" },
];

function friendlyType(type) {
  const map = {
    text: "Text",
    longtext: "Long text",
    multiline_text: "Multi-line text",
    bullet_list: "Bullet list",
    enum: "Choice list",
    url: "Link",
    date: "Date",
    boolean: "Checkbox",
    integer: "Whole number",
    number: "Number",
    foreign_key: "Linked items",
    item_link: "Linked items",
  };
  return map[type] || type;
}

export function renderSetupWizard({
  container,
  schema,
  onChange,
  onApply,
  onPreview,
  statusEl,
}) {
  let step = 0;
  let selectedEntityId = Object.keys(schema.entity_types || {})[0] || null;

  function emit() {
    onChange(schema);
    render();
  }

  function render() {
    container.innerHTML = "";
    container.appendChild(renderStepper());
    const panel = document.createElement("div");
    panel.className = "wizard-panel";
    const current = STEPS[step];
    if (current.id === "entities") renderEntitiesStep(panel);
    else if (current.id === "fields") renderFieldsStep(panel);
    else if (current.id === "views") renderViewsStep(panel);
    else renderApplyStep(panel);
    container.appendChild(panel);
    container.appendChild(renderNav());
  }

  function renderStepper() {
    const nav = document.createElement("nav");
    nav.className = "wizard-steps";
    STEPS.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-step" + (i === step ? " active" : "") + (i < step ? " done" : "");
      btn.innerHTML = `<span class="wizard-step-label">${s.label}</span><span class="wizard-step-short">${s.short}</span>`;
      btn.addEventListener("click", () => {
        step = i;
        render();
      });
      nav.appendChild(btn);
    });
    return nav;
  }

  function renderNav() {
    const bar = document.createElement("div");
    bar.className = "wizard-nav";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn";
    back.textContent = "Back";
    back.disabled = step === 0;
    back.addEventListener("click", () => {
      step = Math.max(0, step - 1);
      render();
    });
    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn btn-primary";
    next.textContent = step === STEPS.length - 1 ? "Apply Changes" : "Next";
    next.addEventListener("click", async () => {
      if (step === STEPS.length - 1) {
        if (onApply) await onApply();
        return;
      }
      step = Math.min(STEPS.length - 1, step + 1);
      render();
    });
    bar.append(back, next);
    return bar;
  }

  function renderEntitiesStep(panel) {
    panel.appendChild(sectionTitle("Items", PANEL_HELP.entities));
    panel.appendChild(
      helpParagraph("Create Item types for what you track. You choose when to add more — nothing is auto-created.")
    );

    const list = document.createElement("ul");
    list.className = "wizard-list";
    Object.entries(schema.entity_types || {}).forEach(([id, entity]) => {
      const li = document.createElement("li");
      li.className = "wizard-list-item";
      li.innerHTML = `<strong>${entity.label}</strong> <span class="muted">Item</span>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-sm";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        if (!confirm(`Remove ${entity.label}?`)) return;
        delete schema.entity_types[id];
        schema.relationships = (schema.relationships || []).filter(
          (r) => r.from !== id && r.to !== id
        );
        schema.views = (schema.views || []).filter((v) => v.entity !== id);
        if (selectedEntityId === id) {
          selectedEntityId = Object.keys(schema.entity_types)[0] || null;
        }
        emit();
      });
      li.appendChild(del);
      list.appendChild(li);
    });
    panel.appendChild(list);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary";
    add.textContent = "+ Add Item";
    add.addEventListener("click", async () => {
      const id = await promptAddItem(schema);
      if (id) {
        selectedEntityId = id;
        emit();
      }
    });
    panel.appendChild(add);
  }

  function renderFieldsStep(panel) {
    panel.appendChild(sectionTitle("Fields", PANEL_HELP.fields));
    panel.appendChild(helpParagraph(FIELD_HELP));

    const entities = Object.entries(schema.entity_types || {});
    if (!entities.length) {
      panel.appendChild(helpParagraph("Add an Item type first, then come back to define its information."));
      return;
    }

    const picker = document.createElement("label");
    picker.className = "design-form-row";
    picker.innerHTML = "<span>Entity</span>";
    const sel = document.createElement("select");
    entities.forEach(([id, e]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${e.label} (Item)`;
      opt.selected = id === selectedEntityId;
      sel.appendChild(opt);
    });
    if (!selectedEntityId) selectedEntityId = entities[0][0];
    sel.addEventListener("change", () => {
      selectedEntityId = sel.value;
      render();
    });
    picker.appendChild(sel);
    panel.appendChild(picker);

    const entity = schema.entity_types[selectedEntityId];
    const list = document.createElement("ul");
    list.className = "wizard-list";
    Object.entries(entity.fields || {}).forEach(([fname, fdef]) => {
      const li = document.createElement("li");
      li.className = "wizard-list-item";
      li.innerHTML = `<strong>${fdef.editor?.header || fname}</strong> <span class="muted">${friendlyType(fdef.type)}</span>`;
      if (!isPrimaryKey(entity, fname)) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn-sm";
        del.textContent = "Remove";
        del.addEventListener("click", () => {
          removeField(schema, selectedEntityId, fname);
          emit();
        });
        li.appendChild(del);
      }
      list.appendChild(li);
    });
    panel.appendChild(list);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary";
    add.textContent = "+ Add info";
    add.addEventListener("click", async () => {
      const res = await promptAddInfo(schema, selectedEntityId);
      if (res) emit();
    });
    panel.appendChild(add);
    renderInferredLinks(panel, schema);
  }

  function renderInferredLinks(panel, schema) {
    const h = document.createElement("h4");
    h.className = "wizard-subhead";
    h.textContent = "Inferred links";
    panel.appendChild(h);
    panel.appendChild(
      helpParagraph(
        "Links are created when you add another Item as a field on an Item. They appear here automatically."
      )
    );

    const list = document.createElement("ul");
    list.className = "wizard-list";
    (schema.relationships || []).forEach((rel) => {
      const li = document.createElement("li");
      li.className = "wizard-list-item";
      const from = schema.entity_types[rel.from]?.label || rel.from;
      const to = schema.entity_types[rel.to]?.label || rel.to;
      li.innerHTML = `<strong>${from} → ${to}</strong> <span class="muted">${storageLabel(rel.storage)}</span>`;
      list.appendChild(li);
    });
    if (!(schema.relationships || []).length) {
      list.innerHTML = `<li class="muted">No links yet — add another Item as a field to create one.</li>`;
    }
    panel.appendChild(list);
  }

  function renderViewsStep(panel) {
    panel.appendChild(sectionTitle("Views", PANEL_HELP.views));
    panel.appendChild(
      helpParagraph("Views become tabs in Workspace — pick an Item and configure columns in Design.")
    );

    const list = document.createElement("ul");
    list.className = "wizard-list";
    (schema.views || []).forEach((view) => {
      const li = document.createElement("li");
      li.className = "wizard-list-item";
      li.innerHTML = `<strong>${view.label}</strong> <span class="muted">${schema.entity_types[view.entity]?.label || view.entity}</span>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-sm";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        schema.views = schema.views.filter((v) => v.id !== view.id);
        emit();
      });
      li.appendChild(del);
      list.appendChild(li);
    });
    if (!(schema.views || []).length) {
      list.innerHTML = `<li class="muted">No views yet — add a tab below.</li>`;
    }
    panel.appendChild(list);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary";
    add.textContent = "+ Add view";
    add.addEventListener("click", () => addViewModal());
    panel.appendChild(add);
  }

  async function addViewModal() {
    const ids = Object.keys(schema.entity_types || {});
    if (!ids.length) {
      alert("Add an Item type first.");
      return;
    }
    const result = await openModal({
      title: "Add a view",
      confirmLabel: "Create view",
      body(root) {
        root.appendChild(selectRow("Show Item", "view-entity", ids, schema));
      },
      onConfirm(root) {
        return { entity: root.querySelector("#view-entity").value };
      },
    });
    if (!result) return;
    const created = createView(schema, {
      entityId: result.entity,
    });
    if (created.error) {
      alert(created.error);
      return;
    }
    emit();
    render();
  }

  function renderApplyStep(panel) {
    panel.appendChild(sectionTitle("Apply Changes", "Review your workspace, then make it live in Workspace."));

    const summary = document.createElement("dl");
    summary.className = "wizard-summary";
    const entityCount = Object.keys(schema.entity_types || {}).length;
    const fieldCount = Object.values(schema.entity_types || {}).reduce(
      (n, e) => n + Object.keys(e.fields || {}).length,
      0
    );
    const relCount = (schema.relationships || []).length;
    const viewCount = (schema.views || []).length;
    summary.innerHTML = `
      <dt>Items</dt><dd>${entityCount}</dd>
      <dt>Fields</dt><dd>${fieldCount}</dd>
      <dt>Links</dt><dd>${relCount}</dd>
      <dt>Views</dt><dd>${viewCount}</dd>
    `;
    panel.appendChild(summary);

    panel.appendChild(
      helpParagraph(
        "Apply updates the database (new tables and fields only) and refreshes Workspace. Destructive removals are blocked until you export a backup."
      )
    );

    const actions = document.createElement("div");
    actions.className = "wizard-apply-actions";
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "btn";
    preview.textContent = "Preview in Workspace";
    preview.addEventListener("click", () => onPreview && onPreview());
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "btn btn-primary";
    apply.textContent = "Apply Changes";
    apply.addEventListener("click", () => onApply && onApply());
    actions.append(preview, apply);
    panel.appendChild(actions);
  }

  render();
  return { refresh: render };
}

function sectionTitle(title, subtitle) {
  const wrap = document.createElement("div");
  wrap.className = "wizard-section-head";
  const h = document.createElement("h3");
  h.textContent = title;
  wrap.appendChild(h);
  wrap.appendChild(helpParagraph(subtitle));
  return wrap;
}

function selectRow(label, id, entityIds, schema, defaultIndex = 0) {
  const row = document.createElement("label");
  row.className = "design-form-row";
  row.innerHTML = `<span>${label}</span>`;
  const sel = document.createElement("select");
  sel.id = id;
  entityIds.forEach((eid, i) => {
    const opt = document.createElement("option");
    opt.value = eid;
    opt.textContent = schema.entity_types[eid].label;
    opt.selected = i === defaultIndex;
    sel.appendChild(opt);
  });
  row.appendChild(sel);
  return row;
}
