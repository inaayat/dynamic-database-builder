/** Short explanations for Design tab concepts. */

export const PANEL_HELP = {
  entities:
    "Entities are the nouns in your schema — each becomes a SQLite table. Entities are the things you want to organize Every workspace starts with one or more entities, and it is a type of item that you want to keep track of.",
  connections:
    "Connections define how entities relate. Storage type controls whether links live as a foreign key, a junction table, or a mirrored text field.",
  views:
    "Views are the tabs in Edit mode. A grid shows editable primary rows; a catalog lists reusable entries you link from the grid.",
};

export const PRIMITIVE_HELP = {
  container:
    "Owns a set of primary rows (e.g. Notebook, Canvas). Usually one default instance; children filter by its id.",
  primary_row:
    "The main editable unit (e.g. Note, Node). Shown in a grid; often belongs to a container via foreign key.",
  catalog_entry:
    "A shared reusable record (e.g. Reference, Tag). Edited in a catalog tab and linked to primary rows.",
};

export const STORAGE_HELP = {
  containment:
    "Parent owns children (1:N). Child table holds a foreign key to the parent — e.g. notebook → notes.",
  junction:
    "Many-to-many tagging/linking. Creates a junction table with composite keys. Optional projection can mirror links as text on a row.",
  assignment:
    "Optional single owner. Child holds a nullable foreign key to a catalog row.",
  projection:
    "Not a storage type alone — when enabled on a junction, formatted lines are written to a multiline_text field on the target (e.g. note.references).",
};

export const VIEW_HELP = {
  grid:
    "Editable table of primary rows. Columns come from fields marked “Show in grid column” (or columns_from_fields).",
  catalog:
    "Sortable list of catalog entries with add/edit. Used for References, Tags, and similar shared records.",
};

export function helpParagraph(text) {
  const p = document.createElement("p");
  p.className = "design-help";
  p.textContent = text;
  return p;
}
