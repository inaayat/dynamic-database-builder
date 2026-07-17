/** Suggested connections between Items (primitive-agnostic). */

import { storageLabel } from "./help-text.js";

export function suggestConnections(schema) {
  const entities = Object.entries(schema.entity_types || {});
  const existing = new Set((schema.relationships || []).map((r) => r.id));
  const recipes = [];

  // Heuristic pairs by name for Notes-like and school-like models
  const byId = Object.fromEntries(entities.map(([id, e]) => [id, { id, ...e }]));

  function addContainment(parentId, childId) {
    if (!byId[parentId] || !byId[childId]) return;
    const parent = byId[parentId];
    const child = byId[childId];
    const id = `${parentId}_contains_${childId}`;
    recipes.push({
      id,
      title: `${parent.label} contains ${child.label_plural || child.label}`,
      description: `One ${parent.label} owns many ${child.label_plural || child.label}.`,
      kind: "containment",
      kindLabel: storageLabel("containment"),
      alreadyAdded:
        existing.has(id) || relationshipExists(schema, parentId, childId, "containment"),
      build() {
        return {
          id,
          from: parentId,
          to: childId,
          cardinality: "1:N",
          storage: "containment",
        };
      },
    });
  }

  function addJunction(aId, bId, title) {
    if (!byId[aId] || !byId[bId]) return;
    const a = byId[aId];
    const b = byId[bId];
    const id = `${aId}_links_${bId}`;
    recipes.push({
      id,
      title: title || `${a.label_plural || a.label} ↔ ${b.label_plural || b.label}`,
      description: `Many-to-many between ${a.label} and ${b.label}.`,
      kind: "junction",
      kindLabel: storageLabel("junction"),
      alreadyAdded: existing.has(id) || relationshipExists(schema, aId, bId, "junction"),
      suggestMirror: false,
      build() {
        return {
          id,
          from: aId,
          to: bId,
          cardinality: "M:N",
          storage: "junction",
          junction: {
            table: `${a.table}_${b.table}_links`.replace(/s_/g, "_").slice(0, 40),
            keys: [`${aId}_id`, `${bId}_id`],
          },
          projection: { enabled: false },
        };
      },
    });
  }

  // Common notes KB
  addContainment("notebook", "note");
  addJunction("reference", "note", "Notes have References");
  addJunction("tag", "note", "Notes have Tags");

  // School-ish guesses
  addContainment("class", "grade");
  addContainment("rubric", "criterion");
  addJunction("student", "class", "Students ↔ Classes");
  addJunction("teacher", "class", "Teachers ↔ Classes");

  // Generic: if only 2–4 items and no recipes yet, offer pairwise M:N for distinct pairs
  if (!recipes.length && entities.length >= 2) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        addJunction(entities[i][0], entities[j][0]);
      }
    }
  }

  return recipes;
}

function relationshipExists(schema, from, to, storage) {
  return (schema.relationships || []).some(
    (r) =>
      r.storage === storage &&
      ((r.from === from && r.to === to) || (r.from === to && r.to === from))
  );
}

export function buildCustomConnection({ from, to, storage, mirror, schema }) {
  const fromE = schema.entity_types[from];
  const toE = schema.entity_types[to];
  const id =
    storage === "containment"
      ? `${from}_contains_${to}`
      : storage === "assignment"
        ? `${from}_assigns_${to}`
        : `${from}_links_${to}`;

  if (storage === "containment") {
    return { id, from, to, cardinality: "1:N", storage: "containment" };
  }
  if (storage === "assignment") {
    return { id, from, to, cardinality: "1:1", storage: "assignment" };
  }
  const rel = {
    id,
    from,
    to,
    cardinality: "M:N",
    storage: "junction",
    junction: {
      table: `${fromE.table}_${toE.table}_links`.replace(/s_/g, "_").slice(0, 40),
      keys: [`${from}_id`, `${to}_id`],
    },
    projection: { enabled: false },
  };
  if (mirror) {
    const mirrorField = Object.keys(toE.fields).find(
      (f) => toE.fields[f].type === "multiline_text"
    );
    if (mirrorField) {
      rel.projection = {
        enabled: true,
        target_entity: to,
        target_field: mirrorField,
        line_format: "{title} — {link}",
        sync_triggers: ["tag_save", "row_save"],
      };
    }
  }
  return rel;
}
