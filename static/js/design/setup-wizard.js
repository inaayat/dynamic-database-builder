/** Guided setup wizard: Items → Info → Connections → Views → Apply. */

import {
  isPrimaryKey,
} from "./field-presets.js";
import {
  FIELD_HELP,
  PANEL_HELP,
  STORAGE_HELP,
  storageLabel,
  VIEW_HELP,
  viewLabel,
  helpParagraph,
} from "./help-text.js";
import { promptAddInfo, promptAddItem } from "./design-actions.js";
import { buildCustomConnection } from "./recipes.js";
import { openModal } from "./modals.js";

const STEPS = [
  { id: "entities", label: "1. Items", short: "What you track" },
  { id: "fields", label: "2. Info", short: "Values & links" },
  { id: "connections", label: "3. Connections", short: "How they relate" },
  { id: "views", label: "4. Views", short: "How you look at them" },
  { id: "apply", label: "5. Apply", short: "Make it live" },
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
    else if (current.id === "connections") renderConnectionsStep(panel);
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
          delete entity.fields[fname];
          (schema.views || []).forEach((v) => {
            if (v.columns_from_fields) {
              v.columns_from_fields = v.columns_from_fields.filter((c) => c !== fname);
            }
          });
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
  }

  function renderConnectionsStep(panel) {
    panel.appendChild(sectionTitle("Connections", PANEL_HELP.connections));
    panel.appendChild(
      helpParagraph(
        "Start with suggested links based on your entities. Or create a custom connection."
      )
    );

    const recipes = suggestConnections(schema);
    if (recipes.length) {
      const h = document.createElement("h4");
      h.className = "wizard-subhead";
      h.textContent = "Suggested for your workspace";
      panel.appendChild(h);
      const list = document.createElement("ul");
      list.className = "wizard-list";
      recipes.forEach((recipe) => {
        const li = document.createElement("li");
        li.className = "wizard-list-item recipe-item";
        const main = document.createElement("div");
        main.innerHTML = `<strong>${recipe.title}</strong> <span class="muted">${recipe.kindLabel}</span><p class="design-help">${recipe.description}</p>`;
        li.appendChild(main);
        if (recipe.alreadyAdded) {
          const badge = document.createElement("span");
          badge.className = "badge-done";
          badge.textContent = "Added";
          li.appendChild(badge);
        } else {
          const add = document.createElement("button");
          add.type = "button";
          add.className = "btn btn-sm";
          add.textContent = "Add";
          add.addEventListener("click", () => {
            const rel = recipe.build({ mirror: recipe.suggestMirror });
            schema.relationships = schema.relationships || [];
            schema.relationships.push(rel);
            emit();
          });
          li.appendChild(add);
        }
        list.appendChild(li);
      });
      panel.appendChild(list);
    } else {
      panel.appendChild(
        helpParagraph("Add at least two Item types to see suggested connections.")
      );
    }

    const h2 = document.createElement("h4");
    h2.className = "wizard-subhead";
    h2.textContent = "Your connections";
    panel.appendChild(h2);

    const existing = document.createElement("ul");
    existing.className = "wizard-list";
    (schema.relationships || []).forEach((rel) => {
      const li = document.createElement("li");
      li.className = "wizard-list-item";
      const from = schema.entity_types[rel.from]?.label || rel.from;
      const to = schema.entity_types[rel.to]?.label || rel.to;
      li.innerHTML = `<strong>${from} → ${to}</strong> <span class="muted">${storageLabel(rel.storage)}</span>`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-sm";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        schema.relationships = schema.relationships.filter((r) => r.id !== rel.id);
        emit();
      });
      li.appendChild(del);
      existing.appendChild(li);
    });
    if (!(schema.relationships || []).length) {
      existing.innerHTML = `<li class="muted">No connections yet.</li>`;
    }
    panel.appendChild(existing);

    const custom = document.createElement("button");
    custom.type = "button";
    custom.className = "btn";
    custom.textContent = "+ Custom connection";
    custom.addEventListener("click", () => customConnectionModal());
    panel.appendChild(custom);
  }

  async function customConnectionModal() {
    const ids = Object.keys(schema.entity_types || {});
    if (ids.length < 2) {
      alert("Add at least two Item types first.");
      return;
    }
    let storage = "junction";
    const result = await openModal({
      title: "Custom connection",
      confirmLabel: "Create connection",
      wide: true,
      body(root) {
        root.appendChild(helpParagraph("Which two things are related, and how?"));
        root.appendChild(selectRow("From", "conn-from", ids, schema));
        root.appendChild(selectRow("To", "conn-to", ids, schema, 1));

        const cards = document.createElement("div");
        cards.className = "choice-cards";
        ["containment", "junction", "assignment"].forEach((id) => {
          const help = STORAGE_HELP[id];
          const card = document.createElement("button");
          card.type = "button";
          card.className = "choice-card" + (id === storage ? " selected" : "");
          card.innerHTML = `<strong>${help.label}</strong><p>${help.summary}</p>`;
          card.addEventListener("click", () => {
            storage = id;
            cards.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
            card.classList.add("selected");
          });
          cards.appendChild(card);
        });
        root.appendChild(cards);

        const mirror = document.createElement("label");
        mirror.className = "design-form-row checkbox-row";
        mirror.innerHTML =
          '<input type="checkbox" id="conn-mirror"> Mirror links as text on the related record';
        root.appendChild(mirror);
      },
      onConfirm(root) {
        return {
          from: root.querySelector("#conn-from").value,
          to: root.querySelector("#conn-to").value,
          storage,
          mirror: root.querySelector("#conn-mirror").checked,
        };
      },
    });
    if (!result) return;
    const rel = buildCustomConnection({ ...result, schema });
    schema.relationships = schema.relationships || [];
    if (schema.relationships.some((r) => r.id === rel.id)) {
      alert("That connection already exists.");
      return;
    }
    schema.relationships.push(rel);
    emit();
  }

  function renderViewsStep(panel) {
    panel.appendChild(sectionTitle("Views", PANEL_HELP.views));
    panel.appendChild(
      helpParagraph("Views become tabs in Workspace. Use a Table for many rows, or a List for a compact roster.")
    );

    const list = document.createElement("ul");
    list.className = "wizard-list";
    (schema.views || []).forEach((view) => {
      const li = document.createElement("li");
      li.className = "wizard-list-item";
      li.innerHTML = `<strong>${view.label}</strong> <span class="muted">${viewLabel(view.type)}</span>`;
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
      list.innerHTML = `<li class="muted">No views yet — add a Table or List.</li>`;
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
    let viewType = "catalog";
    const result = await openModal({
      title: "Add a view",
      confirmLabel: "Create view",
      body(root) {
        root.appendChild(selectRow("Show Item", "view-entity", ids, schema));
        const cards = document.createElement("div");
        cards.className = "choice-cards";
        Object.entries(VIEW_HELP).forEach(([id, help]) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "choice-card" + (id === viewType ? " selected" : "");
          card.innerHTML = `<strong>${help.label}</strong><p>${help.summary}</p><p class="muted">Best for: ${(help.bestFor || []).join(", ")}</p>`;
          card.addEventListener("click", () => {
            viewType = id;
            cards.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
            card.classList.add("selected");
          });
          cards.appendChild(card);
        });
        root.appendChild(cards);
      },
      onConfirm(root) {
        return { entity: root.querySelector("#view-entity").value, type: viewType };
      },
    });
    if (!result) return;
    const entityDef = schema.entity_types[result.entity];
    const view = {
      id: `${result.entity}_${result.type}`,
      type: result.type,
      entity: result.entity,
      label: entityDef.label_plural || entityDef.label,
    };
    if (result.type === "grid") {
      view.primary = !(schema.views || []).some((v) => v.primary);
      view.columns_from_fields = Object.entries(entityDef.fields || {})
        .filter(([, f]) => f.editor?.column)
        .map(([n]) => n);
      const container = Object.entries(schema.entity_types).find(
        ([, e]) => e.primitive === "container"
      );
      if (container) view.container_entity = container[0];
    }
    schema.views = schema.views || [];
    schema.views.push(view);
    emit();
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
      <dt>Connections</dt><dd>${relCount}</dd>
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
