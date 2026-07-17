import { ensureViewShape, getViewColumns } from "../view-columns.js";
import { FIELD_TYPES } from "./field-presets.js";
import {
  FIELD_HELP,
  helpConceptBlock,
  helpParagraph,
  INSPECTOR_HELP,
  PAGE_INTRO,
  PANEL_HELP,
  PRIMITIVE_HELP,
  primitiveLabel,
  STORAGE_HELP,
  storageLabel,
  VIEW_HELP,
} from "./help-text.js";

export function renderInspector({ container, selection, schema, onChange }) {
  container.innerHTML = "";

  if (!selection || selection.type === "none") {
    const title = document.createElement("h3");
    title.textContent = "Inspector";
    container.appendChild(title);
    container.appendChild(helpParagraph(INSPECTOR_HELP));

    const overview = document.createElement("div");
    overview.className = "design-help-concepts";
    overview.appendChild(
      helpConceptBlock({
        label: "Entities",
        summary: PANEL_HELP.entities,
      })
    );
    overview.appendChild(
      helpConceptBlock({
        label: "Connections",
        summary: PANEL_HELP.connections,
      })
    );
    overview.appendChild(
      helpConceptBlock({
        label: "Views",
        summary: PANEL_HELP.views,
      })
    );
    container.appendChild(overview);
    container.appendChild(helpParagraph(PAGE_INTRO.note));
    return;
  }

  if (selection.type === "entity") {
    const entity = schema.entity_types[selection.entityId];
    const kind = PRIMITIVE_HELP[entity.primitive];
    container.innerHTML = `<h3>${entity.label}</h3>`;
    if (kind) {
      container.appendChild(helpConceptBlock(kind));
    }
    const form = entityForm(entity, () => onChange(schema));
    container.appendChild(form);
    return;
  }

  if (selection.type === "field") {
    const entity = schema.entity_types[selection.entityId];
    const field = entity.fields[selection.fieldName];
    container.innerHTML = `<h3>${selection.fieldName}</h3>`;
    container.appendChild(helpParagraph(FIELD_HELP));
    container.appendChild(
      helpParagraph(
        "Turn on “Show in table” so this field appears as a column when people edit records."
      )
    );
    container.appendChild(fieldForm(field, selection.fieldName, () => onChange(schema)));
    return;
  }

  if (selection.type === "relationship") {
    const rel = selection.relationship;
    const kind = STORAGE_HELP[rel.storage];
    container.innerHTML = `<h3>Connection</h3>`;
    if (kind && typeof kind === "object") {
      container.appendChild(helpConceptBlock(kind));
    }
    if (rel.projection?.enabled) {
      container.appendChild(helpParagraph(STORAGE_HELP.projection));
    }
    container.appendChild(relationshipForm(rel, schema, () => onChange(schema)));
    return;
  }

  if (selection.type === "view") {
    const view = selection.view;
    ensureViewShape(view, schema);
    container.innerHTML = `<h3>${view.label}</h3>`;
    container.appendChild(helpConceptBlock(VIEW_HELP.grid));
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
    labelInput("Name", entity.label, (v) => {
      entity.label = v;
      onChange();
    })
  );
  wrap.appendChild(
    labelInput("Plural name", entity.label_plural || "", (v) => {
      entity.label_plural = v;
      onChange();
    })
  );
  const prim = document.createElement("p");
  prim.className = "muted";
  prim.textContent = `Type: ${primitiveLabel(entity.primitive)}`;
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
    opt.textContent = friendlyFieldType(t);
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
      labelInput("Choices (comma-separated)", (field.options || []).join(", "), (v) => {
        field.options = v.split(",").map((s) => s.trim()).filter(Boolean);
        onChange();
      })
    );
  }

  field.editor = field.editor || {};
  wrap.appendChild(
    labelInput("Column label", field.editor.header || fieldName, (v) => {
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
  colRow.append(colCheck, document.createTextNode(" Show in table"));
  wrap.appendChild(colRow);

  return wrap;
}

function friendlyFieldType(type) {
  const map = {
    text: "Text",
    longtext: "Long text",
    multiline_text: "Multi-line text",
    bullet_list: "Bullet list",
    enum: "Choice list",
    url: "Link",
    integer: "Whole number",
    number: "Number",
    boolean: "Checkbox",
    date: "Date",
    string: "Short ID",
  };
  return map[type] || type;
}

function relationshipForm(rel, schema, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "design-form";

  wrap.appendChild(
    labelInput("Name", rel.id, (v) => {
      rel.id = v;
      onChange();
    })
  );

  const storageRow = document.createElement("label");
  storageRow.className = "design-form-row";
  storageRow.innerHTML = "<span>Relationship</span>";
  const storageSel = document.createElement("select");
  ["containment", "junction", "assignment"].forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = storageLabel(s);
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
      labelInput("Link table", rel.junction.table, (v) => {
        rel.junction.table = v;
        onChange();
      })
    );
    wrap.appendChild(
      labelInput("Link keys (comma-separated)", rel.junction.keys.join(", "), (v) => {
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
    projRow.append(projCheck, document.createTextNode(" Mirror links on the related record"));
    wrap.appendChild(projRow);

    if (rel.projection.enabled) {
      wrap.appendChild(
        labelInput("Show on entity", rel.projection.target_entity || rel.to, (v) => {
          rel.projection.target_entity = v;
          onChange();
        })
      );
      wrap.appendChild(
        labelInput("Show in field", rel.projection.target_field || "", (v) => {
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
  const fromLabel = schema.entity_types[rel.from]?.label || rel.from;
  const toLabel = schema.entity_types[rel.to]?.label || rel.to;
  fromTo.textContent = `${fromLabel} → ${toLabel}`;
  wrap.appendChild(fromTo);

  return wrap;
}

function viewForm(view, schema, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "design-form";

  wrap.appendChild(
    labelInput("Tab name", view.label, (v) => {
      view.label = v;
      onChange();
    })
  );

  const entity = schema.entity_types[view.entity];
  const cols = getViewColumns(view, schema)
    .filter((c) => c.source === "primary")
    .map((c) => c.field);
  wrap.appendChild(
    labelInput("Columns (comma-separated)", cols.join(", "), (v) => {
      const names = v.split(",").map((s) => s.trim()).filter(Boolean);
      const joinCols = (view.columns || []).filter((c) => c.source === "join");
      view.columns = [
        ...names.map((field) => ({
          id: `primary:${field}`,
          source: "primary",
          field,
          mode: "edit",
        })),
        ...joinCols,
      ];
      onChange();
    })
  );
  const available = Object.keys(entity?.fields || {}).join(", ");
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = `Available fields: ${available}`;
  wrap.appendChild(hint);

  return wrap;
}
