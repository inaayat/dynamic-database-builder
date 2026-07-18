/** Brainstorm model — concepts, placements, compile to schema. */

import {
  addLinkToEntity,
  addValueToEntity,
  createItemType,
  createView,
} from "./design-actions.js";
import { slugify } from "./modals.js";

export const STEP_COPY = {
  dump: {
    title: "What might you track?",
    coach: "Jot kinds of records and bits of info. You'll sort them next.",
  },
  sort: {
    title: "Record or detail?",
    coach: "Records are things you'll have many of. Details live on a record.",
  },
  place: {
    title: "Where does each detail live?",
    coach: "Drop details onto a record, then pick a format.",
  },
  link: {
    title: "Connect records",
    coach: "Add another record as a field when they belong together — like Tags on a Note.",
  },
  review: {
    title: "Does this look right?",
    coach: "Links were created from the records you connected.",
  },
  tabs: {
    title: "Workspace tabs",
    coach: "Each tab shows one kind of record. Joins are filled in from your links.",
  },
};

export const GHOST_CHIPS = ["Note", "Tag", "title", "description", "due date", "status"];

export const FORMAT_OPTIONS = [
  { type: "text", label: "Short text" },
  { type: "longtext", label: "Long text" },
  { type: "date", label: "Date" },
  { type: "enum", label: "Choice" },
  { type: "number", label: "Number" },
  { type: "boolean", label: "Checkbox" },
  { type: "url", label: "URL" },
  { type: "bullet_list", label: "Bullets" },
];

const RECORD_HINTS = /^(note|tag|student|class|notebook|reference|project|task|person|contact|book|article|category|folder|rubric|theme|resource)s?$/i;
const DETAIL_HINTS = /^(title|name|description|body|summary|status|due\s*date|date|link|url|notes|content|priority|type|email|phone)$/i;

const FIELD_TYPE_HINTS = {
  description: "longtext",
  body: "bullet_list",
  summary: "longtext",
  notes: "longtext",
  content: "longtext",
  date: "date",
  "due date": "date",
  status: "enum",
  priority: "enum",
  link: "url",
  url: "url",
  email: "url",
  type: "enum",
};

const CARDINALITY_TO_STORAGE = {
  many: "junction",
  one: "assignment",
  owned: "containment",
};

let nextId = 1;

export function createBrainstormState() {
  return { concepts: [], placements: [], links: [] };
}

export function createConcept(label) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const suggestedKind = suggestKind(trimmed);
  return {
    id: `c${nextId++}`,
    label: trimmed,
    kind: "unset",
    suggestedKind,
  };
}

export function suggestKind(label) {
  const lower = label.trim().toLowerCase();
  if (RECORD_HINTS.test(lower)) return "item";
  if (DETAIL_HINTS.test(lower)) return "scalar";
  if (/^[A-Z]/.test(label.trim()) && label.trim().length > 2) return "item";
  return "scalar";
}

export function suggestFieldType(label) {
  const lower = label.trim().toLowerCase();
  return FIELD_TYPE_HINTS[lower] || "text";
}

export function parseChipInput(text) {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function effectiveKind(concept) {
  return concept.kind === "unset" ? concept.suggestedKind : concept.kind;
}

export function commitSuggestedKinds(state) {
  state.concepts.forEach((c) => {
    if (c.kind === "unset") c.kind = c.suggestedKind;
  });
}

export function itemConcepts(state) {
  return state.concepts.filter((c) => effectiveKind(c) === "item");
}

export function scalarConcepts(state) {
  return state.concepts.filter((c) => effectiveKind(c) === "scalar");
}

export function unplacedScalars(state) {
  const placed = new Set(
    state.placements.filter((p) => !p.linkTargetId).map((p) => p.conceptId)
  );
  return scalarConcepts(state).filter((c) => !placed.has(c.id));
}

export function scalarsOnRecord(state, itemConceptId) {
  return state.placements
    .filter((p) => !p.linkTargetId && p.entityId === itemConceptId)
    .map((p) => ({
      placement: p,
      concept: state.concepts.find((c) => c.id === p.conceptId),
    }))
    .filter((x) => x.concept);
}

export function linksOnRecord(state, itemConceptId) {
  return (state.links || []).filter((l) => l.fromConceptId === itemConceptId);
}

export function recordHasTitleLike(state, itemConceptId) {
  const titleLike = /^(title|name)$/i;
  return state.placements.some((p) => {
    if (p.entityId !== itemConceptId || p.linkTargetId) return false;
    const c = state.concepts.find((sc) => sc.id === p.conceptId);
    return c && titleLike.test(c.label);
  });
}

export function stepReady(step, state) {
  switch (step) {
    case "dump":
      return state.concepts.length > 0;
    case "sort":
      return (
        state.concepts.length > 0 &&
        itemConcepts(state).length > 0
      );
    case "place": {
      const unplaced = unplacedScalars(state);
      const missingTitle = itemConcepts(state).some(
        (c) => !recordHasTitleLike(state, c.id)
      );
      return unplaced.length === 0 && !missingTitle;
    }
    case "link":
      return true;
    case "review":
      return itemConcepts(state).length > 0;
    case "tabs":
      return itemConcepts(state).length > 0;
    default:
      return false;
  }
}

export function stepBlockedReason(step, state) {
  if (stepReady(step, state)) return "";
  switch (step) {
    case "dump":
      return "Add at least one concept to continue";
    case "sort":
      if (!state.concepts.length) return "Add concepts first";
      if (!itemConcepts(state).length) return "Mark at least one chip as a Record";
      return "Mark each chip as a Record or a Detail to continue";
    case "place": {
      const unplaced = unplacedScalars(state);
      if (unplaced.length) {
        return `Place ${unplaced.length} detail${unplaced.length === 1 ? "" : "s"} on a record`;
      }
      return "Each record needs a title or name detail";
    }
    default:
      return "";
  }
}

/** Demote item → warn if linked elsewhere. */
export function demoteWarnings(state, conceptId) {
  const asSource = (state.links || []).filter((l) => l.fromConceptId === conceptId);
  const asTarget = (state.links || []).filter((l) => l.toConceptId === conceptId);
  const placements = state.placements.filter(
    (p) => p.entityId === conceptId || p.linkTargetId === conceptId
  );
  if (!asSource.length && !asTarget.length && !placements.length) return [];
  const lines = [];
  if (asSource.length) lines.push("Links from this record will be removed.");
  if (asTarget.length) lines.push("Other records link here — those links will be removed.");
  if (placements.length) lines.push("Details placed on this record will be unplaced.");
  return lines;
}

export function demoteToScalar(state, conceptId) {
  const warnings = demoteWarnings(state, conceptId);
  state.links = (state.links || []).filter(
    (l) => l.fromConceptId !== conceptId && l.toConceptId !== conceptId
  );
  state.placements = state.placements.filter(
    (p) => p.entityId !== conceptId && p.linkTargetId !== conceptId
  );
  const c = state.concepts.find((x) => x.id === conceptId);
  if (c) c.kind = "scalar";
  return warnings;
}

export function promoteToItem(state, conceptId) {
  const c = state.concepts.find((x) => x.id === conceptId);
  if (c) c.kind = "item";
  state.placements = state.placements.filter((p) => p.conceptId !== conceptId);
}

export function addLink(state, fromConceptId, toConceptId, cardinality = "many") {
  if (fromConceptId === toConceptId) return { error: "Can't link a record to itself." };
  const exists = (state.links || []).some(
    (l) => l.fromConceptId === fromConceptId && l.toConceptId === toConceptId
  );
  if (exists) return { error: "That link already exists." };
  state.links = state.links || [];
  state.links.push({ fromConceptId, toConceptId, cardinality });
  return { ok: true };
}

export function removeLink(state, fromConceptId, toConceptId) {
  state.links = (state.links || []).filter(
    (l) => !(l.fromConceptId === fromConceptId && l.toConceptId === toConceptId)
  );
}

export function placeScalar(state, conceptId, entityId, fieldType) {
  state.placements = state.placements.filter((p) => p.conceptId !== conceptId);
  state.placements.push({
    conceptId,
    entityId,
    fieldType: fieldType || suggestFieldType(
      state.concepts.find((c) => c.id === conceptId)?.label || ""
    ),
  });
}

export function unplaceScalar(state, conceptId) {
  state.placements = state.placements.filter(
    (p) => !(p.conceptId === conceptId && !p.linkTargetId)
  );
}

export function compileToSchema(state, baseSchema) {
  const schema = blankWorkspace(baseSchema);
  const conceptToEntityId = new Map();

  for (const c of itemConcepts(state)) {
    const result = createItemType(schema, c.label);
    if (!result.error) conceptToEntityId.set(c.id, result.id);
  }

  for (const p of state.placements.filter((pl) => !pl.linkTargetId)) {
    const entityId = conceptToEntityId.get(p.entityId);
    const concept = state.concepts.find((c) => c.id === p.conceptId);
    if (!entityId || !concept) continue;

    const entity = schema.entity_types[entityId];
    const fieldSlug = slugify(concept.label);
    const fieldType = p.fieldType || suggestFieldType(concept.label);

    if (fieldSlug === "title" && entity?.fields?.title) {
      entity.fields.title.editor = entity.fields.title.editor || {};
      entity.fields.title.editor.header = concept.label;
      if (fieldType !== "text") {
        const res = addValueToEntity(schema, entityId, {
          label: concept.label,
          type: fieldType,
        });
        if (!res.error) delete entity.fields.title;
      }
      continue;
    }

    if (fieldSlug === "name" && entity?.fields?.title) {
      entity.fields.title.editor = entity.fields.title.editor || {};
      entity.fields.title.editor.header = concept.label;
      continue;
    }

    addValueToEntity(schema, entityId, { label: concept.label, type: fieldType });
  }

  for (const c of itemConcepts(state)) {
    const entityId = conceptToEntityId.get(c.id);
    if (!entityId) continue;
    if (!recordHasTitleLike(state, c.id)) {
      const entity = schema.entity_types[entityId];
      if (entity?.fields?.title) {
        entity.fields.title.editor = entity.fields.title.editor || {};
        entity.fields.title.editor.header = "Title";
      }
    }
  }

  for (const link of state.links || []) {
    const fromId = conceptToEntityId.get(link.fromConceptId);
    const toId = conceptToEntityId.get(link.toConceptId);
    if (!fromId || !toId) continue;

    const targetConcept = state.concepts.find((c) => c.id === link.toConceptId);
    const storage = CARDINALITY_TO_STORAGE[link.cardinality || "many"];

    if (storage === "containment") {
      addLinkToEntity(schema, toId, {
        label: state.concepts.find((c) => c.id === link.fromConceptId)?.label || "Item",
        targetId: fromId,
        storage: "containment",
      });
    } else {
      addLinkToEntity(schema, fromId, {
        label: targetConcept?.label || "Link",
        targetId: toId,
        storage,
      });
    }
  }

  for (const c of itemConcepts(state)) {
    const entityId = conceptToEntityId.get(c.id);
    if (entityId) createView(schema, { entityId });
  }

  return schema;
}

function blankWorkspace(current) {
  return {
    schema_version: current.schema_version || "1.1",
    title: "My Workspace",
    site: {
      ...(current.site || {}),
      id: current.site?.id || "my-workspace",
      title: current.site?.title || "My Workspace",
    },
    storage: current.storage || { local_db: "planning.db" },
    format_conventions: current.format_conventions || { bullet_separator: "\u001e" },
    entity_types: {},
    relationships: [],
    views: [],
    actions: current.actions || [],
    export_profiles: current.export_profiles || {},
    seed: {},
  };
}

export function summarizeBrainstorm(state) {
  const items = itemConcepts(state);
  const scalars = scalarConcepts(state);
  const links = state.links || [];
  return { itemCount: items.length, scalarCount: scalars.length, linkCount: links.length };
}
