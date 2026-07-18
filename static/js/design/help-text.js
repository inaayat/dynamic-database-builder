/** User-facing Design copy — Items only. */

export const PAGE_INTRO = {
  title: "Design",
  lead:
    "Build your workspace from Items — add fields, link Items together, then choose how they appear.",
  note: "Links are fields you add on an Item. Changes stay in Design until you Apply Changes.",
};

export const PANEL_HELP = {
  entities:
    "Items are the kinds of records you track — each becomes a table in your database.",
  connections:
    "Links are created when you add another Item as a field — many-to-many, one-to-one, or owned-by.",
  views:
    "Tabs in Workspace. Pick the primary Item, connected Items (joins), and which columns appear — editable, read-only, or chips for many-to-many links.",
};

export const PRIMITIVE_HELP = {
  primary_row: {
    label: "Item",
    summary: "A type of record you track.",
    detail: "Add values it stores, or link it to other Items.",
    examples: ["Note", "Student", "Class", "Tag", "Rubric"],
  },
  // Legacy labels if old schemas still have these primitives
  container: {
    label: "Item",
    summary: "A type of record you track.",
    detail: "Treated as an Item in Design.",
    examples: [],
  },
  catalog_entry: {
    label: "Item",
    summary: "A type of record you track.",
    detail: "Treated as an Item in Design.",
    examples: [],
  },
};

export const STORAGE_HELP = {
  containment: {
    label: "One to Many",
    summary: "One Item owns or contains several others.",
    examples: ["Class → Students", "Notebook → Notes", "Rubric → Criteria"],
  },
  junction: {
    label: "Many to Many",
    summary: "Items can link to many on both sides.",
    examples: ["Notes ↔ Tags", "Teachers ↔ Classes", "Students ↔ Classes"],
  },
  assignment: {
    label: "Optional Link",
    summary: "Connect only when needed; leave empty otherwise.",
    examples: ["Assigned teacher", "Classroom", "Subject"],
  },
  projection:
    "When mirroring is on, linked Items also appear as readable lines on a text field.",
};

export const VIEW_HELP = {
  grid: {
    label: "Tab",
    summary:
      "A workspace grid over a primary Item plus optional connected joins (chips and related fields).",
    bestFor: ["Notes", "Tags", "References", "any working data"],
  },
};

export const FIELD_HELP =
  "Choose a simple value, or link to another Item as a field (you pick many, one, or owned-by).";

export const INSPECTOR_HELP =
  "Select an Item on the map to edit its values and links. Apply Changes makes the workspace live.";

export const ENTITY_EXAMPLES =
  "Examples: Note, Notebook, Tag, Student, Class, Rubric.";

export function primitiveLabel(id) {
  return "Item";
}

export function storageLabel(id) {
  return STORAGE_HELP[id]?.label || id;
}

export function viewLabel(id) {
  if (id === "catalog") return VIEW_HELP.grid.label;
  return VIEW_HELP[id]?.label || id;
}

export function helpParagraph(text) {
  const p = document.createElement("p");
  p.className = "design-help";
  p.textContent = text;
  return p;
}

export function helpConceptBlock({ label, summary, detail, examples, bestFor }) {
  const wrap = document.createElement("div");
  wrap.className = "design-help-concept";
  const title = document.createElement("div");
  title.className = "design-help-concept-title";
  title.textContent = label;
  wrap.appendChild(title);
  if (summary) {
    const s = document.createElement("p");
    s.className = "design-help";
    s.textContent = summary;
    wrap.appendChild(s);
  }
  if (detail) {
    const d = document.createElement("p");
    d.className = "design-help";
    d.textContent = detail;
    wrap.appendChild(d);
  }
  const samples = examples || bestFor;
  if (samples?.length) {
    const ul = document.createElement("ul");
    ul.className = "design-help-examples";
    const heading = document.createElement("li");
    heading.className = "design-help-examples-label";
    heading.textContent = bestFor && !examples ? "Best for" : "Examples";
    ul.appendChild(heading);
    samples.forEach((ex) => {
      const li = document.createElement("li");
      li.textContent = ex;
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }
  return wrap;
}

export function helpConceptList(entries) {
  const list = document.createElement("div");
  list.className = "design-help-concepts";
  Object.values(entries).forEach((entry) => {
    if (typeof entry === "string") return;
    if (entry.label === "Item" && entries.primary_row && entry !== entries.primary_row) return;
    list.appendChild(helpConceptBlock(entry));
  });
  return list;
}
