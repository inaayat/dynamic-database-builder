import { FIELD_TYPES } from "./field-presets.js";
import {
  helpParagraph,
  PANEL_HELP,
  PRIMITIVE_HELP,
  STORAGE_HELP,
  VIEW_HELP,
} from "./help-text.js";

export function renderInspector({ container, selection, schema, onChange }) {
  container.innerHTML = "";

  if (!selection || selection.type === "none") {
    const title = document.createElement("h3");
    title.textContent = "Inspector";
    container.appendChild(title);
    container.appendChild(
      helpParagraph(
        "Select an entity, field, connection, or view to edit its details. " +
          "Changes stay in the Design tab until you Apply & migrate DB."
      )
    );
    const overview = document.createElement("ul");
    overview.className = "design-help-list";
    overview.innerHTML = `
      <li><strong>Entities</strong> — ${PANEL_HELP.entities}</li>
      <li><strong>Connections</strong> — ${PANEL_HELP.connections}</li>
      <li><strong>Views</strong> — ${PANEL_HELP.views}</li>
    `;
    container.appendChild(overview);
    return;
  }

  if (selection.type === "entity") {
    const entity = schema.entity_types[selection.entityId];
    container.innerHTML = `<h3>${entity.label}</h3>`;
    if (PRIMITIVE_HELP[entity.primitive]) {
      container.appendChild(helpParagraph(PRIMITIVE_HELP[entity.primitive]));
    }
    const form = entityForm(entity, () => onChange(schema));
    container.appendChild(form);
    return;
  }

  if (selection.type === "field") {
    const entity = schema.entity_types[selection.entityId];
    const field = entity.fields[selection.fieldName];
    container.innerHTML = `<h3>${selection.fieldName}</h3>`;
    container.appendChild(
      helpParagraph(
        "Fields become table columns. Mark “Show in grid column” so the Edit tab grid includes this field."
      )
    );
    container.appendChild(fieldForm(field, selection.fieldName, () => onChange(schema)));
    return;
  }

  if (selection.type === "relationship") {
    const rel = selection.relationship;
    container.innerHTML = `<h3>Connection</h3>`;
    if (STORAGE_HELP[rel.storage]) {
      container.appendChild(helpParagraph(STORAGE_HELP[rel.storage]));
    }
    if (rel.projection?.enabled) {
      container.appendChild(helpParagraph(STORAGE_HELP.projection));
    }
    container.appendChild(relationshipForm(rel, schema, () => onChange(schema)));
    return;
  }

  if (selection.type === "view") {
    const view = selection.view;
    container.innerHTML = `<h3>View: ${view.label}</h3>`;
    if (VIEW_HELP[view.type]) {
      container.appendChild(helpParagraph(VIEW_HELP[view.type]));
    }
    container.appendChild(viewForm(view, schema, () => onChange(schema)));
  }
}

function labelInput(label, value, onInput) {
  const row = document.createElement("label");
  row.className = "design-form-row";
  row.innerHTML = `<span>${label}</span>`;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value));
  row.appendChild(input);
  return row;
}

function entityForm(entity, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "design-form";
  wrap.appendChild(
    labelInput("Label", entity.label, (v) => {
      entity.label = v;
      onChange();
    })
  );
  wrap.appendChild(
    labelInput("Plural", entity.label_plural || "", (v) => {
      entity.label_plural = v;
      onChange();
    })
  );
  wrap.appendChild(
    labelInput("Table", entity.table, (v) => {
      entity.table = v;
      onChange();
    })
  );
  const prim = document.createElement("p");
  prim.className = "muted";
  prim.textContent = `Primitive: ${entity.primitive}`;
  wrap.appendChild(prim);
  return wrap;
}

function fieldForm(field, fieldName, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "design-form";

  const typeRow = document.createElement("label");
  typeRow.className = "design-form-row";
  typeRow.innerHTML = "<span>Type</span>";
  const typeSel = document.createElement("select");
  FIELD_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    opt.selected = field.type === t;
    typeSel.appendChild(opt);
  });
  typeSel.addEventListener("change", () => {
    field.type = typeSel.value;
    onChange();
  });
  typeRow.appendChild(typeSel);
  wrap.appendChild(typeRow);

  if (field.type === "enum") {
    wrap.appendChild(
      labelInput("Options (comma-separated)", (field.options || []).join(", "), (v) => {
        field.options = v.split(",").map((s) => s.trim()).filter(Boolean);
        onChange();
      })
    );
  }

  field.editor = field.editor || {};
  wrap.appendChild(
    labelInput("Column header", field.editor.header || fieldName, (v) => {
      field.editor.header = v;
      onChange();
    })
  );

  const colRow = document.createElement("label");
  colRow.className = "design-form-row checkbox-row";
  const colCheck = document.createElement("input");
  colCheck.type = "checkbox";
  colCheck.checked = !!field.editor.column;
  colCheck.addEventListener("change", () => {
    field.editor.column = colCheck.checked;
    onChange();
  });
  colRow.append(colCheck, document.createTextNode(" Show in grid column"));
  wrap.appendChild(colRow);

  return wrap;
}

function relationshipForm(rel, schema, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "design-form";

  wrap.appendChild(
    labelInput("ID", rel.id, (v) => {
      rel.id = v;
      onChange();
    })
  );

  const storageRow = document.createElement("label");
  storageRow.className = "design-form-row";
  storageRow.innerHTML = "<span>Storage</span>";
  const storageSel = document.createElement("select");
  ["containment", "junction", "assignment"].forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    opt.selected = rel.storage === s;
    storageSel.appendChild(opt);
  });
  storageSel.addEventListener("change", () => {
    rel.storage = storageSel.value;
    onChange();
  });
  storageRow.appendChild(storageSel);
  wrap.appendChild(storageRow);

  if (rel.storage === "junction" && rel.junction) {
    wrap.appendChild(
      labelInput("Junction table", rel.junction.table, (v) => {
        rel.junction.table = v;
        onChange();
      })
    );
    wrap.appendChild(
      labelInput("Junction keys (comma-separated)", rel.junction.keys.join(", "), (v) => {
        rel.junction.keys = v.split(",").map((s) => s.trim()).filter(Boolean);
        onChange();
      })
    );

    rel.projection = rel.projection || { enabled: false };
    const projRow = document.createElement("label");
    projRow.className = "design-form-row checkbox-row";
    const projCheck = document.createElement("input");
    projCheck.type = "checkbox";
    projCheck.checked = !!rel.projection.enabled;
    projCheck.addEventListener("change", () => {
      rel.projection.enabled = projCheck.checked;
      onChange();
    });
    projRow.append(projCheck, document.createTextNode(" Projection enabled"));
    wrap.appendChild(projRow);

    if (rel.projection.enabled) {
      wrap.appendChild(
        labelInput("Target entity", rel.projection.target_entity || rel.to, (v) => {
          rel.projection.target_entity = v;
          onChange();
        })
      );
      wrap.appendChild(
        labelInput("Target field", rel.projection.target_field || "", (v) => {
          rel.projection.target_field = v;
          onChange();
        })
      );
      wrap.appendChild(
        labelInput("Line format", rel.projection.line_format || "{title}", (v) => {
          rel.projection.line_format = v;
          onChange();
        })
      );
    }
  }

  const fromTo = document.createElement("p");
  fromTo.className = "muted";
  fromTo.textContent = `${rel.from} → ${rel.to} (${rel.cardinality || ""})`;
  wrap.appendChild(fromTo);

  return wrap;
}

function viewForm(view, schema, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "design-form";

  wrap.appendChild(
    labelInput("Label", view.label, (v) => {
      view.label = v;
      onChange();
    })
  );

  if (view.type === "grid") {
    const entity = schema.entity_types[view.entity];
    const cols = view.columns_from_fields || [];
    wrap.appendChild(
      labelInput("Grid columns (comma-separated)", cols.join(", "), (v) => {
        view.columns_from_fields = v.split(",").map((s) => s.trim()).filter(Boolean);
        onChange();
      })
    );
    const available = Object.keys(entity?.fields || {}).join(", ");
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = `Available: ${available}`;
    wrap.appendChild(hint);
  }

  return wrap;
}
