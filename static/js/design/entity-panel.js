import {
  defaultEntity,
  defaultFieldDef,
  FIELD_TYPES,
  isPrimaryKey,
  PRIMITIVES,
} from "./field-presets.js";
import { helpParagraph, PANEL_HELP, PRIMITIVE_HELP } from "./help-text.js";

export function renderEntityPanel({ container, schema, onChange, onSelect }) {
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

    const primHelp = document.createElement("ul");
    primHelp.className = "design-help-list";
    Object.entries(PRIMITIVE_HELP).forEach(([id, text]) => {
      const li = document.createElement("li");
      li.innerHTML = `<code>${id}</code> — ${text}`;
      primHelp.appendChild(li);
    });
    container.appendChild(primHelp);

    const list = document.createElement("ul");
    list.className = "design-list";
    Object.entries(schema.entity_types || {}).forEach(([id, entity]) => {
      const li = document.createElement("li");
      li.className = "design-list-item" + (id === selectedEntityId ? " selected" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "design-list-btn";
      btn.textContent = `${entity.label} (${id}) · ${entity.primitive}`;
      btn.title = PRIMITIVE_HELP[entity.primitive] || "";
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
      const type = prompt(`Field type (${FIELD_TYPES.join(", ")}):`, "text");
      if (!type || !FIELD_TYPES.includes(type)) return;
      const label = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      entity.fields[name] = defaultFieldDef(type, label);
      const gridView = (schema.views || []).find(
        (v) => v.type === "grid" && v.entity === entityId
      );
      if (gridView && entity.fields[name].editor?.column) {
        gridView.columns_from_fields = gridView.columns_from_fields || [];
        if (!gridView.columns_from_fields.includes(name)) {
          gridView.columns_from_fields.push(name);
        }
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
          delete entity.fields[fname];
          (schema.views || []).forEach((v) => {
            if (v.columns_from_fields) {
              v.columns_from_fields = v.columns_from_fields.filter((c) => c !== fname);
            }
          });
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
    const primLabels = PRIMITIVES.map((p) => p.id).join(", ");
    const primitive = prompt(`Primitive (${primLabels}):`, "catalog_entry");
    if (!primitive) return;
    schema.entity_types[id] = defaultEntity(primitive, id);
    selectedEntityId = id;
    emit();
    onSelect({ type: "entity", entityId: id });
    render();
  }

  render();
  return { refresh: render };
}
