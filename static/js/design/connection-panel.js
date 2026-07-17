import {
  helpConceptBlock,
  helpParagraph,
  PANEL_HELP,
  STORAGE_HELP,
  storageLabel,
  VIEW_HELP,
  viewLabel,
} from "./help-text.js";

export function renderConnectionPanel({ container, schema, onChange, onSelect, compactHelp = false }) {
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
    if (!compactHelp) {
      container.appendChild(
        helpParagraph(
          "For a Notes knowledge base: a Notebook contains many Notes, a Note can have many Tags."
        )
      );
      const storageWrap = document.createElement("div");
      storageWrap.className = "design-help-concepts";
      ["containment", "junction", "assignment"].forEach((id) => {
        storageWrap.appendChild(helpConceptBlock(STORAGE_HELP[id]));
      });
      container.appendChild(storageWrap);
    } else {
      container.appendChild(
        helpParagraph("One to Many · Many to Many · Optional Link")
      );
    }

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
      const kind = storageLabel(rel.storage);
      const mirror = rel.projection?.enabled ? " · mirrored on row" : "";
      btn.textContent = `${fromLabel} → ${toLabel} · ${kind}${mirror}`;
      btn.title = STORAGE_HELP[rel.storage]?.summary || "";
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
    if (!compactHelp) {
      const viewWrap = document.createElement("div");
      viewWrap.className = "design-help-concepts";
      Object.values(VIEW_HELP).forEach((entry) => {
        viewWrap.appendChild(helpConceptBlock(entry));
      });
      container.appendChild(viewWrap);
    } else {
      container.appendChild(helpParagraph("Table for main items · List for references."));
    }

    const viewList = document.createElement("ul");
    viewList.className = "design-list compact";
    (schema.views || []).forEach((view) => {
      const li = document.createElement("li");
      li.className = "design-list-item";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "design-list-btn";
      btn.textContent = `${view.label} · ${viewLabel(view.type)}`;
      btn.title = VIEW_HELP[view.type]?.summary || "";
      btn.addEventListener("click", () => onSelect({ type: "view", view }));
      li.appendChild(btn);
      viewList.appendChild(li);
    });
    container.appendChild(viewList);
  }

  function openAddConnection() {
    const entities = Object.keys(schema.entity_types || {});
    if (entities.length < 2) {
      alert("Add at least two entities before creating a connection.");
      return;
    }
    const from = prompt(`From entity (${entities.join(", ")}):`, entities[0]);
    const to = prompt(`To entity (${entities.join(", ")}):`, entities[1]);
    if (!from || !to || !entities.includes(from) || !entities.includes(to)) return;

    const storageChoice = prompt(
      "How do these relate?\n\n" +
        "One to Many — one item contains several others (Notebook → Notes)\n" +
        "Many to Many — both sides can have many links (Notes ↔ Tags)\n" +
        "Optional Link — connect only when needed (Assigned Person)\n\n" +
        "Enter: One to Many, Many to Many, or Optional Link",
      "Many to Many"
    );
    if (!storageChoice) return;

    const storageMap = {
      "one to many": "containment",
      containment: "containment",
      "many to many": "junction",
      junction: "junction",
      "optional link": "assignment",
      assignment: "assignment",
    };
    const storage = storageMap[storageChoice.toLowerCase().trim()];
    if (!storage) {
      alert("Please choose: One to Many, Many to Many, or Optional Link");
      return;
    }

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
    const entity = prompt(`Which entity is this view for? (${entities.join(", ")}):`, entities[0]);
    if (!entity || !entities.includes(entity)) return;

    const typeChoice = prompt(
      "How should people look at this information?\n\n" +
        "Table — view and edit many records quickly\n" +
        "List — a simple compact list of reusable records\n\n" +
        "Enter: Table or List",
      "List"
    );
    if (!typeChoice) return;
    const typeMap = { table: "grid", grid: "grid", list: "catalog", catalog: "catalog" };
    const type = typeMap[typeChoice.toLowerCase().trim()];
    if (!type) {
      alert("Please choose: Table or List");
      return;
    }

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
      const containerEntity = Object.entries(schema.entity_types).find(
        ([, e]) => e.primitive === "container"
      );
      if (containerEntity) view.container_entity = containerEntity[0];
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
