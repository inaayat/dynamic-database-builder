import { helpParagraph, PANEL_HELP, STORAGE_HELP, VIEW_HELP } from "./help-text.js";

export function renderConnectionPanel({ container, schema, onChange, onSelect }) {
  let selectedRelId = null;

  function emit() {
    onChange(schema);
  }

  function render() {
    container.innerHTML = "";
    const header = document.createElement("div");
    header.className = "design-panel-header";
    header.innerHTML = "<strong>Connections</strong>";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-sm";
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", () => openAddConnection());
    header.appendChild(addBtn);
    container.appendChild(header);
    container.appendChild(helpParagraph(PANEL_HELP.connections));

    const storageHelp = document.createElement("ul");
    storageHelp.className = "design-help-list";
    ["containment", "junction", "assignment"].forEach((id) => {
      const li = document.createElement("li");
      li.innerHTML = `<code>${id}</code> — ${STORAGE_HELP[id]}`;
      storageHelp.appendChild(li);
    });
    container.appendChild(storageHelp);

    const list = document.createElement("ul");
    list.className = "design-list";
    (schema.relationships || []).forEach((rel) => {
      const li = document.createElement("li");
      li.className = "design-list-item" + (rel.id === selectedRelId ? " selected" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "design-list-btn";
      const fromLabel = schema.entity_types[rel.from]?.label || rel.from;
      const toLabel = schema.entity_types[rel.to]?.label || rel.to;
      const proj = rel.projection?.enabled ? " + projection" : "";
      btn.textContent = `${fromLabel} → ${toLabel} (${rel.storage}${proj})`;
      btn.title = STORAGE_HELP[rel.storage] || "";
      btn.addEventListener("click", () => {
        selectedRelId = rel.id;
        onSelect({ type: "relationship", relationship: rel });
        render();
      });
      li.appendChild(btn);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-icon";
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Remove connection "${rel.id}"?`)) return;
        schema.relationships = schema.relationships.filter((r) => r.id !== rel.id);
        if (selectedRelId === rel.id) {
          selectedRelId = null;
          onSelect({ type: "none" });
        }
        emit();
        render();
      });
      li.appendChild(del);
      list.appendChild(li);
    });
    container.appendChild(list);

    const viewsHeader = document.createElement("div");
    viewsHeader.className = "design-panel-header";
    viewsHeader.innerHTML = "<strong>Views</strong>";
    const addView = document.createElement("button");
    addView.type = "button";
    addView.className = "btn btn-sm";
    addView.textContent = "+ View";
    addView.addEventListener("click", () => openAddView());
    viewsHeader.appendChild(addView);
    container.appendChild(viewsHeader);
    container.appendChild(helpParagraph(PANEL_HELP.views));

    const viewHelp = document.createElement("ul");
    viewHelp.className = "design-help-list";
    Object.entries(VIEW_HELP).forEach(([id, text]) => {
      const li = document.createElement("li");
      li.innerHTML = `<code>${id}</code> — ${text}`;
      viewHelp.appendChild(li);
    });
    container.appendChild(viewHelp);

    const viewList = document.createElement("ul");
    viewList.className = "design-list compact";
    (schema.views || []).forEach((view) => {
      const li = document.createElement("li");
      li.className = "design-list-item";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "design-list-btn";
      btn.textContent = `${view.label} (${view.type})`;
      btn.title = VIEW_HELP[view.type] || "";
      btn.addEventListener("click", () => onSelect({ type: "view", view }));
      li.appendChild(btn);
      viewList.appendChild(li);
    });
    container.appendChild(viewList);
  }

  function openAddConnection() {
    const entities = Object.keys(schema.entity_types || {});
    if (entities.length < 2) {
      alert("Need at least 2 entities");
      return;
    }
    const from = prompt(`From entity (${entities.join(", ")}):`, entities[0]);
    const to = prompt(`To entity (${entities.join(", ")}):`, entities[1]);
    if (!from || !to || !entities.includes(from) || !entities.includes(to)) return;
    const storage = prompt("Storage (containment, junction, assignment):", "junction");
    if (!storage) return;

    const id = `${from}_${storage === "containment" ? "contains" : "links"}_${to}`;
    const rel = {
      id,
      from,
      to,
      cardinality: storage === "containment" ? "1:N" : "M:N",
      storage,
    };

    if (storage === "junction") {
      const fromTable = schema.entity_types[from].table;
      const toTable = schema.entity_types[to].table;
      rel.junction = {
        table: `${fromTable}_${toTable}_links`.replace(/s_/g, "_").slice(0, 40),
        keys: [`${from}_id`, `${to}_id`],
      };
      rel.projection = { enabled: false };
    }

    schema.relationships = schema.relationships || [];
    schema.relationships.push(rel);
    selectedRelId = id;
    emit();
    onSelect({ type: "relationship", relationship: rel });
    render();
  }

  function openAddView() {
    const entities = Object.keys(schema.entity_types || {});
    const entity = prompt(`Entity for view (${entities.join(", ")}):`, entities[0]);
    if (!entity || !entities.includes(entity)) return;
    const type = prompt("View type (grid, catalog):", "catalog");
    if (!type) return;
    const id = `${entity}_${type}`;
    const entityDef = schema.entity_types[entity];
    const view = {
      id,
      type,
      entity,
      label: entityDef.label_plural || entityDef.label,
    };
    if (type === "grid") {
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
    onSelect({ type: "view", view });
    render();
  }

  render();
  return { refresh: render };
}
