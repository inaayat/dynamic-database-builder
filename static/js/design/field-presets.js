/** Field type presets for new fields in Design tab. */

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

export const PRIMITIVES = [
  { id: "container", label: "Container" },
  { id: "primary_row", label: "Primary row" },
  { id: "catalog_entry", label: "Catalog entry" },
];

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

export function defaultEntity(primitive, id) {
  const table = id.replace(/-/g, "_");
  if (primitive === "container") {
    return {
      primitive,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      label_plural: id.charAt(0).toUpperCase() + id.slice(1) + "s",
      table: table + "s",
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
          publish: true,
        },
      },
    };
  }
  if (primitive === "primary_row") {
    return {
      primitive,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      label_plural: id.charAt(0).toUpperCase() + id.slice(1) + "s",
      table: table + "s",
      primary_key: ["container_id", "id"],
      fields: {
        container_id: {
          type: "foreign_key",
          sqlite: { column: "TEXT", nullable: false, primary_key: true },
          publish: true,
        },
        id: {
          type: "integer",
          sqlite: { column: "INTEGER", nullable: false, primary_key: true },
          required: true,
          publish: true,
        },
        title: {
          type: "text",
          sqlite: { column: "TEXT", nullable: false, default: "''" },
          editor: { column: true, order: 1, header: "Title" },
          publish: true,
        },
      },
    };
  }
  return {
    primitive: "catalog_entry",
    label: id.charAt(0).toUpperCase() + id.slice(1),
    label_plural: id.charAt(0).toUpperCase() + id.slice(1) + "s",
    table: table + "s",
    primary_key: "id",
    fields: {
      id: {
        type: "string",
        sqlite: { column: "TEXT", nullable: false, primary_key: true },
        required: true,
        publish: true,
      },
      name: {
        type: "text",
        sqlite: { column: "TEXT", nullable: false, default: "''" },
        required: true,
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
