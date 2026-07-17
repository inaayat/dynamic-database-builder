/** Item presets — v1 is Items only (primitive stored as primary_row for backend compat). */

export const FIELD_TYPES = [
  "text",
  "longtext",
  "multiline_text",
  "bullet_list",
  "enum",
  "url",
  "integer",
  "number",
  "boolean",
  "date",
  "string",
];

/** UI only offers Item; backend still accepts legacy primitives on load. */
export const PRIMITIVES = [{ id: "primary_row", label: "Item" }];

export const ITEM_PRIMITIVE = "primary_row";

export function defaultFieldDef(type, label) {
  const header = label || type;
  const base = {
    type,
    editor: { column: true, header },
    publish: true,
  };
  switch (type) {
    case "enum":
      return {
        ...base,
        options: ["option_a", "option_b"],
        sqlite: { column: "TEXT", nullable: false, default: "''" },
      };
    case "integer":
      return {
        ...base,
        sqlite: { column: "INTEGER", nullable: false },
      };
    case "number":
      return {
        ...base,
        sqlite: { column: "REAL", nullable: true },
      };
    case "boolean":
      return {
        ...base,
        sqlite: { column: "INTEGER", nullable: false, default: "0" },
        editor: { column: false, header },
      };
    case "bullet_list":
      return {
        ...base,
        sqlite: { column: "TEXT", nullable: false, default: "''" },
        serialize: { separator: "\u001e" },
      };
    case "multiline_text":
      return {
        ...base,
        sqlite: { column: "TEXT", nullable: false, default: "''" },
      };
    case "date":
      return {
        ...base,
        sqlite: { column: "TEXT", nullable: true },
      };
    default:
      return {
        ...base,
        sqlite: { column: "TEXT", nullable: false, default: "''" },
      };
  }
}

/** Flat Item — no automatic container_id; links come from connections. */
export function defaultEntity(primitive, id) {
  const table = (id.replace(/-/g, "_") + "s").replace(/ss$/, "s");
  const label = id.charAt(0).toUpperCase() + id.slice(1);
  return {
    primitive: ITEM_PRIMITIVE,
    label,
    label_plural: label.endsWith("s") ? label : label + "s",
    table,
    primary_key: "id",
    fields: {
      id: {
        type: "string",
        sqlite: { column: "TEXT", nullable: false, primary_key: true },
        required: true,
        publish: true,
      },
      title: {
        type: "text",
        sqlite: { column: "TEXT", nullable: false, default: "''" },
        required: true,
        editor: { column: true, order: 1, header: "Title" },
        publish: true,
      },
    },
  };
}

export function isPrimaryKey(entity, fieldName) {
  const pk = entity.primary_key;
  if (Array.isArray(pk)) return pk.includes(fieldName);
  return pk === fieldName;
}

/** Soft link field created when user chooses One to Many / Optional Link. */
export function defaultLinkField(fromId, label) {
  return {
    type: "foreign_key",
    ref: `${fromId}.id`,
    sqlite: { column: "TEXT", nullable: true },
    editor: { column: false, header: label || fromId },
    publish: true,
    link_to: fromId,
  };
}
