import { removeField } from "./design-actions.js";
import {
  defaultFieldDef,
  FIELD_TYPES,
  isPrimaryKey,
  PRIMITIVES,
} from "./field-presets.js";
import {
  ENTITY_EXAMPLES,
  helpConceptList,
  helpParagraph,
  PANEL_HELP,
  PRIMITIVE_HELP,
  primitiveLabel,
} from "./help-text.js";
import { addPrimaryColumn } from "../view-columns.js";

export function renderEntityPanel({ container, schema, onChange, onSelect, compactHelp = false }) {
  let selectedEntityId = null;
  let selectedField = null;

  function emit() {
    onChange(schema);
  }

  function render() {
    container.innerHTML = "";
    const header = document.createElement("div");
    header.className = "design-panel-header";
    header.innerHTML = "<strong>Entities</strong>";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-sm";
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", () => openAddEntityDialog());
    header.appendChild(addBtn);
    container.appendChild(header);
    container.appendChild(helpParagraph(PANEL_HELP.entities));
    if (!compactHelp) {
      container.appendChild(helpParagraph(ENTITY_EXAMPLES));
      container.appendChild(helpConceptList(PRIMITIVE_HELP));
    } else {
      container.appendChild(
        helpParagraph("Types: Collection (group), Item (main records), Reference (reusable).")
      );
    }

    const list = document.createElement("ul");
    list.className = "design-list";
    Object.entries(schema.entity_types || {}).forEach(([id, entity]) => {
      const li = document.createElement("li");
      li.className = "design-list-item" + (id === selectedEntityId ? " selected" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "design-list-btn";
      const kind = primitiveLabel(entity.primitive);
      btn.textContent = `${entity.label} · ${kind}`;
      btn.title = PRIMITIVE_HELP[entity.primitive]?.summary || "";
      btn.addEventListener("click", () => {
        selectedEntityId = id;
        selectedField = null;
        onSelect({ type: "entity", entityId: id });
        render();
      });
      li.appendChild(btn);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-icon";
      del.title = "Remove entity";
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Remove entity "${id}"?`)) return;
        delete schema.entity_types[id];
        schema.relationships = (schema.relationships || []).filter(
          (r) => r.from !== id && r.to !== id
        );
        schema.views = (schema.views || []).filter((v) => v.entity !== id);
        if (selectedEntityId === id) {
          selectedEntityId = null;
          onSelect({ type: "none" });
        }
        emit();
        render();
      });
      li.appendChild(del);
      list.appendChild(li);
    });
    container.appendChild(list);

    if (selectedEntityId && schema.entity_types[selectedEntityId]) {
      renderFieldInspector(container, schema.entity_types[selectedEntityId], selectedEntityId);
    }
  }

  function renderFieldInspector(parent, entity, entityId) {
    const section = document.createElement("div");
    section.className = "design-inspector-section";
    section.innerHTML = `<h4>Fields — ${entity.label}</h4>`;
    section.appendChild(
      helpParagraph(
        "Fields are the information you store for each record — title, summary, status, and so on."
      )
    );

    const addField = document.createElement("button");
    addField.type = "button";
    addField.className = "btn btn-sm";
    addField.textContent = "+ Field";
    addField.addEventListener("click", () => {
      const name = prompt("Field name (snake_case):");
      if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) return;
      if (entity.fields[name]) {
        alert("Field already exists");
        return;
      }
      const typePrompt = prompt(
        "What kind of information is this?\n\n" +
          "Examples: Text, Long text, Choice list, Date, Link, Checkbox, Bullet list\n\n" +
          `Or enter a type id: ${FIELD_TYPES.join(", ")}`,
        "Text"
      );
      if (!typePrompt) return;
      const typeMap = {
        text: "text",
        "long text": "longtext",
        longtext: "longtext",
        "multi-line text": "multiline_text",
        multiline_text: "multiline_text",
        "bullet list": "bullet_list",
        bullet_list: "bullet_list",
        "choice list": "enum",
        enum: "enum",
        link: "url",
        url: "url",
        "whole number": "integer",
        integer: "integer",
        number: "number",
        checkbox: "boolean",
        boolean: "boolean",
        date: "date",
        "short id": "string",
        string: "string",
      };
      const type = typeMap[typePrompt.toLowerCase().trim()];
      if (!type || !FIELD_TYPES.includes(type)) {
        alert(`Please choose a known field type.`);
        return;
      }
      const label = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      entity.fields[name] = defaultFieldDef(type, label);
      const gridView = (schema.views || []).find(
        (v) => v.type === "grid" && v.entity === entityId
      );
      if (gridView && entity.fields[name].editor?.column) {
        addPrimaryColumn(gridView, schema, name);
      }
      selectedField = name;
      emit();
      onSelect({ type: "field", entityId, fieldName: name });
      render();
    });
    section.appendChild(addField);

    const fieldList = document.createElement("ul");
    fieldList.className = "design-list compact";
    Object.entries(entity.fields || {}).forEach(([fname, fdef]) => {
      const li = document.createElement("li");
      li.className =
        "design-list-item" + (fname === selectedField ? " selected" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "design-list-btn";
      btn.textContent = `${fname} (${fdef.type})`;
      btn.addEventListener("click", () => {
        selectedField = fname;
        onSelect({ type: "field", entityId, fieldName: fname, field: fdef });
        render();
      });
      li.appendChild(btn);
      if (!isPrimaryKey(entity, fname)) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn-icon";
        del.textContent = "×";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!confirm(`Remove field "${fname}"?`)) return;
          removeField(schema, entityId, fname);
          if (selectedField === fname) selectedField = null;
          emit();
          render();
        });
        li.appendChild(del);
      }
      fieldList.appendChild(li);
    });
    section.appendChild(fieldList);
    parent.appendChild(section);
  }

  function openAddEntityDialog() {
    const id = prompt("Entity id (snake_case):");
    if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) return;
    if (schema.entity_types[id]) {
      alert("Entity already exists");
      return;
    }
    const primLabels = PRIMITIVES.map((p) => p.label).join(", ");
    const primitiveLabelPrompt = prompt(
      `What kind of entity?\n\n` +
        `Collection — a group that contains other items (Notebook, Project)\n` +
        `Item — main records you edit every day (Note, Task)\n` +
        `Reference — reusable items you link from many places (Tag, Author)\n\n` +
        `Enter: ${primLabels}`,
      "Reference"
    );
    if (!primitiveLabelPrompt) return;
    const matched = PRIMITIVES.find(
      (p) =>
        p.label.toLowerCase() === primitiveLabelPrompt.toLowerCase() ||
        p.id === primitiveLabelPrompt.toLowerCase().replace(/\s+/g, "_")
    );
    if (!matched) {
      alert(`Please choose one of: ${primLabels}`);
      return;
    }
    schema.entity_types[id] = defaultEntity(matched.id, id);
    selectedEntityId = id;
    emit();
    onSelect({ type: "entity", entityId: id });
    render();
  }

  render();
  return { refresh: render };
}
