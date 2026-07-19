/** Brainstorm model — concepts, placements, compile to schema. */

import {
  addLinkToEntity,
  addValueToEntity,
  createItemType,
  createView,
} from "./design-actions.js";
import { slugify } from "./modals.js";

export const STEP_COPY = {
  setup: {
    title: "Build your workspace",
    coach:
      "Add concepts at the top, mark each as Record or Detail, then add values on each record card. The same detail can go on multiple records.",
  },
  review: {
    title: "Does this look right?",
    coach: "Each record stores a name plus the values you added. Links were created automatically.",
  },
  tabs: {
    title: "Workspace tabs",
    coach: "Each tab shows one kind of record. Joins are filled in from your linked records.",
  },
};

export const GHOST_CHIPS = [
  "Note",
  "Tag",
  "Teacher",
  "Class",
  "Description",
  "Due date",
  "Status",
];

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

export const CARDINALITY_LABELS = {
  many: { label: "Many", hint: "Can pick several" },
  one: { label: "One", hint: "At most one" },
  owned: { label: "Owned by", hint: "Belongs inside" },
};

const RECORD_HINTS =
  /^(note|tag|student|class|teacher|subject|notebook|reference|project|task|person|contact|book|article|category|folder|rubric|theme|resource)s?$/i;
const DETAIL_HINTS =
  /^(title|name|description|body|summary|status|due\s*date|date|link|url|notes|content|priority|type|email|phone|bio)$/i;

const FIELD_TYPE_HINTS = {
  description: "longtext",
  body: "bullet_list",
  summary: "longtext",
  notes: "longtext",
  content: "longtext",
  bio: "longtext",
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
  return { concepts: [], placements: [] };
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

export function suggestFieldType(label, defaultType = "text") {
  const lower = label.trim().toLowerCase();
  return FIELD_TYPE_HINTS[lower] || defaultType;
}

export function defaultFieldTypeFromSchema(schema) {
  return schema?.format_conventions?.default_field_type || "text";
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

export function isScalarPlacement(p) {
  return Boolean(p.conceptId) && !p.linkTargetId;
}

export function isRecordLinkPlacement(p) {
  return Boolean(p.linkTargetId);
}

export function unplacedScalars(state) {
  const placed = new Set(
    state.placements.filter((p) => isScalarPlacement(p)).map((p) => p.conceptId)
  );
  return scalarConcepts(state).filter((c) => !placed.has(c.id));
}

export function scalarOnRecord(state, conceptId, entityId) {
  return state.placements.some(
    (p) =>
      isScalarPlacement(p) && p.conceptId === conceptId && p.entityId === entityId
  );
}

export function scalarsAvailableForRecord(state, entityId) {
  return scalarConcepts(state).filter((c) => !scalarOnRecord(state, c.id, entityId));
}

export function scalarHasOpenSlots(state, conceptId) {
  return itemConcepts(state).some((item) => !scalarOnRecord(state, conceptId, item.id));
}

export function scalarsOnRecord(state, itemConceptId) {
  return state.placements
    .filter((p) => isScalarPlacement(p) && p.entityId === itemConceptId)
    .map((p) => ({
      placement: p,
      concept: state.concepts.find((c) => c.id === p.conceptId),
    }))
    .filter((x) => x.concept);
}

export function recordsOnRecord(state, itemConceptId) {
  return state.placements
    .filter((p) => isRecordLinkPlacement(p) && p.entityId === itemConceptId)
    .map((p) => ({
      placement: p,
      concept: state.concepts.find((c) => c.id === p.linkTargetId),
    }))
    .filter((x) => x.concept);
}

export function availableRecordLinks(state, entityId) {
  const linked = new Set(
    recordsOnRecord(state, entityId).map(({ concept }) => concept.id)
  );
  return itemConcepts(state).filter((c) => c.id !== entityId && !linked.has(c.id));
}

export function recordIdentityLabel(itemConcept) {
  return itemConcept?.label || "Name";
}

export function stepReady(step, state) {
  switch (step) {
    case "setup": {
      if (!state.concepts.length) return false;
      if (!itemConcepts(state).length) return false;
      return unplacedScalars(state).length === 0;
    }
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
    case "setup":
      if (!state.concepts.length) return "Add at least one concept to continue";
      if (!itemConcepts(state).length) return "Mark at least one concept as a Record";
      {
        const unplaced = unplacedScalars(state);
        if (unplaced.length) {
          return `Place ${unplaced.length} detail${unplaced.length === 1 ? "" : "s"} on a record`;
        }
      }
      return "";
    default:
      return "";
  }
}

/** Demote item → warn if linked elsewhere. */
export function demoteWarnings(state, conceptId) {
  const asSource = state.placements.filter(
    (p) => p.entityId === conceptId && p.linkTargetId
  );
  const asTarget = state.placements.filter((p) => p.linkTargetId === conceptId);
  const scalarPlacements = state.placements.filter(
    (p) => p.conceptId === conceptId || (p.entityId === conceptId && !p.linkTargetId)
  );
  if (!asSource.length && !asTarget.length && !scalarPlacements.length) return [];
  const lines = [];
  if (asSource.length) lines.push("Values on this record will be removed.");
  if (asTarget.length) lines.push("Other records store this — those values will be removed.");
  if (scalarPlacements.length) lines.push("Details placed on this record will be unplaced.");
  return lines;
}

export function demoteToScalar(state, conceptId) {
  const warnings = demoteWarnings(state, conceptId);
  state.placements = state.placements.filter(
    (p) =>
      p.conceptId !== conceptId &&
      p.entityId !== conceptId &&
      p.linkTargetId !== conceptId
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

export function findConceptByLabel(state, label) {
  const lower = label.trim().toLowerCase();
  if (!lower) return null;
  return state.concepts.find((c) => c.label.toLowerCase() === lower) || null;
}

export function addDetailOnRecord(state, label, entityId, fieldType) {
  const trimmed = label.trim();
  if (!trimmed) return { error: "Enter a detail name." };

  let concept = findConceptByLabel(state, trimmed);
  if (concept) {
    if (effectiveKind(concept) === "item") {
      return {
        error: `"${concept.label}" is a Record. Use Add value to link records.`,
      };
    }
    concept.kind = "scalar";
  } else {
    concept = createConcept(trimmed);
    if (!concept) return { error: "Invalid name." };
    concept.kind = "scalar";
    state.concepts.push(concept);
  }

  return placeScalar(
    state,
    concept.id,
    entityId,
    fieldType || suggestFieldType(trimmed)
  );
}

export function setConceptFieldType(state, conceptId, fieldType) {
  const concept = state.concepts.find((c) => c.id === conceptId);
  if (!concept) return;
  concept.fieldType = fieldType;
  state.placements
    .filter((p) => p.conceptId === conceptId && isScalarPlacement(p))
    .forEach((p) => {
      p.fieldType = fieldType;
    });
}

export function placeScalar(state, conceptId, entityId, fieldType, defaultType = "text") {
  if (scalarOnRecord(state, conceptId, entityId)) return { error: "Already on this record." };
  const concept = state.concepts.find((c) => c.id === conceptId);
  const resolvedType =
    fieldType ||
    concept?.fieldType ||
    suggestFieldType(concept?.label || "", defaultType);
  state.placements.push({
    conceptId,
    entityId,
    fieldType: resolvedType,
  });
  return { ok: true };
}

export function unplaceScalar(state, conceptId, entityId) {
  state.placements = state.placements.filter(
    (p) =>
      !(
        p.conceptId === conceptId &&
        p.entityId === entityId &&
        isScalarPlacement(p)
      )
  );
}

export function placeRecordLink(state, entityId, linkTargetId, cardinality = "many") {
  if (entityId === linkTargetId) return { error: "Can't store a record on itself." };
  const exists = state.placements.some(
    (p) => p.entityId === entityId && p.linkTargetId === linkTargetId
  );
  if (exists) return { error: "That record is already a value here." };
  state.placements.push({ entityId, linkTargetId, cardinality });
  return { ok: true };
}

export function removeRecordLink(state, entityId, linkTargetId) {
  state.placements = state.placements.filter(
    (p) => !(p.entityId === entityId && p.linkTargetId === linkTargetId)
  );
}

export function removeConcept(state, conceptId) {
  state.concepts = state.concepts.filter((x) => x.id !== conceptId);
  state.placements = state.placements.filter(
    (p) =>
      p.conceptId !== conceptId &&
      p.entityId !== conceptId &&
      p.linkTargetId !== conceptId
  );
}

export function compileToSchema(state, baseSchema) {
  const schema = blankWorkspace(baseSchema);
  const conceptToEntityId = new Map();

  for (const c of itemConcepts(state)) {
    const result = createItemType(schema, c.label);
    if (!result.error) conceptToEntityId.set(c.id, result.id);
  }

  for (const c of itemConcepts(state)) {
    const entityId = conceptToEntityId.get(c.id);
    if (!entityId) continue;
    const entity = schema.entity_types[entityId];
    if (entity?.fields?.title) {
      entity.fields.title.editor = entity.fields.title.editor || {};
      entity.fields.title.editor.header = recordIdentityLabel(c);
    }
  }

  for (const p of state.placements.filter((pl) => isScalarPlacement(pl))) {
    const entityId = conceptToEntityId.get(p.entityId);
    const concept = state.concepts.find((c) => c.id === p.conceptId);
    if (!entityId || !concept) continue;

    const entity = schema.entity_types[entityId];
    const fieldSlug = slugify(concept.label);
    const fieldType =
      p.fieldType ||
      concept.fieldType ||
      suggestFieldType(concept.label, defaultFieldTypeFromSchema(baseSchema));

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

  for (const p of state.placements.filter((pl) => isRecordLinkPlacement(pl))) {
    const fromId = conceptToEntityId.get(p.entityId);
    const toId = conceptToEntityId.get(p.linkTargetId);
    if (!fromId || !toId) continue;

    const targetConcept = state.concepts.find((c) => c.id === p.linkTargetId);
    const sourceConcept = state.concepts.find((c) => c.id === p.entityId);
    const storage = CARDINALITY_TO_STORAGE[p.cardinality || "many"];

    if (storage === "containment") {
      addLinkToEntity(schema, toId, {
        label: sourceConcept?.label || "Item",
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
  const linkCount = state.placements.filter((p) => isRecordLinkPlacement(p)).length;
  return { itemCount: items.length, scalarCount: scalars.length, linkCount };
}
