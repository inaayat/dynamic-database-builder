/** View column/join helpers — shared by Design and Workspace Customize. */

export function relationshipsForEntity(schema, entityId) {
  return (schema.relationships || []).filter(
    (r) => r.from === entityId || r.to === entityId
  );
}

export function otherEntityInRel(rel, entityId) {
  return rel.from === entityId ? rel.to : rel.from;
}

export function relationshipLabel(schema, rel, entityId) {
  const other = schema.entity_types[otherEntityInRel(rel, entityId)];
  return other?.label_plural || other?.label || rel.id;
}

export function defaultPrimaryColumns(entity) {
  const pk = Array.isArray(entity.primary_key)
    ? entity.primary_key[0]
    : entity.primary_key;
  return Object.entries(entity.fields || {})
    .filter(([name, f]) => f.editor?.column && !f.design_only && f.type !== "item_link")
    .filter(([name]) => name !== pk)
    .map(([field]) => ({
      id: `primary:${field}`,
      source: "primary",
      field,
      mode: "edit",
    }));
}

export function defaultColumnForJoin(schema, view, relationshipId) {
  const rel = (schema.relationships || []).find((r) => r.id === relationshipId);
  if (!rel) return null;
  if (rel.storage === "junction") {
    return {
      id: `join:${relationshipId}`,
      source: "join",
      relationship_id: relationshipId,
      mode: "chip",
    };
  }
  const otherId = otherEntityInRel(rel, view.entity);
  const fkName = `${otherId}_id`;
  const entity = schema.entity_types[view.entity];
  if (entity?.fields?.[fkName]) {
    return {
      id: `primary:${fkName}`,
      source: "primary",
      field: fkName,
      mode: rel.storage === "assignment" ? "edit" : "view",
    };
  }
  return {
    id: `join:${relationshipId}`,
    source: "join",
    relationship_id: relationshipId,
    mode: "view",
  };
}

/** Ensure view has joins + columns arrays; migrate legacy columns_from_fields. */
export function ensureViewShape(view, schema) {
  if (view.type === "catalog") view.type = "grid";
  if (!view.joins) view.joins = [];
  if (!view.columns?.length && view.columns_from_fields?.length) {
    view.columns = view.columns_from_fields.map((field) => ({
      id: `primary:${field}`,
      source: "primary",
      field,
      mode: "edit",
    }));
  }
  if (!view.columns?.length && schema) {
    const entity = schema.entity_types[view.entity];
    if (entity) view.columns = defaultPrimaryColumns(entity);
  }
  if (!view.columns) view.columns = [];
  return view;
}

export function getViewColumns(view, schema) {
  const copy = { ...view, joins: [...(view.joins || [])], columns: [...(view.columns || [])] };
  ensureViewShape(copy, schema);
  return copy.columns;
}

export function syncViewColumnsFromEntity(view, schema) {
  ensureViewShape(view, schema);
  const entity = schema.entity_types[view.entity];
  if (!entity) return;
  const joinCols = (view.columns || []).filter((c) => c.source === "join");
  const primaryCols = defaultPrimaryColumns(entity);
  view.columns = [...primaryCols, ...joinCols];
}

export function toggleViewJoin(view, schema, relationshipId) {
  ensureViewShape(view, schema);
  const idx = view.joins.findIndex((j) => j.relationship_id === relationshipId);
  if (idx >= 0) {
    view.joins.splice(idx, 1);
    view.columns = view.columns.filter(
      (c) =>
        !(
          c.source === "join" &&
          (c.relationship_id === relationshipId ||
            c.id.startsWith(`join:${relationshipId}:`))
        )
    );
    return false;
  }
  view.joins.push({ relationship_id: relationshipId });
  return true;
}

export function removeViewColumn(view, columnId) {
  view.columns = (view.columns || []).filter((c) => c.id !== columnId);
}

export function reorderViewColumn(view, columnId, toIndex) {
  const cols = view.columns || [];
  const from = cols.findIndex((c) => c.id === columnId);
  if (from < 0) return;
  const [item] = cols.splice(from, 1);
  const target = Math.max(0, Math.min(toIndex, cols.length));
  cols.splice(target, 0, item);
}

export function moveViewColumn(view, columnId, delta) {
  const cols = view.columns || [];
  const idx = cols.findIndex((c) => c.id === columnId);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= cols.length) return;
  const [item] = cols.splice(idx, 1);
  cols.splice(next, 0, item);
}

export function updateViewColumn(view, columnId, patch) {
  const col = (view.columns || []).find((c) => c.id === columnId);
  if (!col) return;
  Object.assign(col, patch);
}

export function addPrimaryColumn(view, schema, field, mode = "edit") {
  ensureViewShape(view, schema);
  const id = `primary:${field}`;
  if (view.columns.some((c) => c.id === id)) return;
  view.columns.push({ id, source: "primary", field, mode });
}

export function availablePrimaryFields(schema, view) {
  return columnCandidates(schema, view)
    .filter((c) => c.source === "primary")
    .filter((c) => !(view.columns || []).some((col) => col.id === c.id))
    .map(({ field, label }) => ({ field, label }));
}

/** All column options from primary Item + selected connections. */
export function columnCandidates(schema, view) {
  ensureViewShape(view, schema);
  const candidates = [];
  const primary = schema.entity_types[view.entity];
  if (!primary) return candidates;
  const primaryLabel = primary.label || view.entity;

  const pk = Array.isArray(primary.primary_key) ? primary.primary_key[0] : primary.primary_key;
  Object.entries(primary.fields || {}).forEach(([field, fdef]) => {
    if (fdef.design_only || fdef.type === "item_link" || field === pk) return;
    candidates.push({
      id: `primary:${field}`,
      source: "primary",
      field,
      mode: "edit",
      group: primaryLabel,
      label: fdef.editor?.header || field,
    });
  });

  (view.joins || []).forEach((join) => {
    const rel = (schema.relationships || []).find((r) => r.id === join.relationship_id);
    if (!rel) return;
    const otherId = otherEntityInRel(rel, view.entity);
    const other = schema.entity_types[otherId];
    const groupLabel = other?.label || otherId;

    if (rel.storage === "junction") {
      candidates.push({
        id: `join:${rel.id}`,
        source: "join",
        relationship_id: rel.id,
        mode: "chip",
        group: groupLabel,
        label: relationshipLabel(schema, rel, view.entity),
      });
    }

    if (rel.storage === "assignment" && rel.from === view.entity) {
      const fk = `${otherId}_id`;
      if (primary.fields?.[fk]) {
        const fdef = primary.fields[fk];
        candidates.push({
          id: `primary:${fk}`,
          source: "primary",
          field: fk,
          mode: "edit",
          group: groupLabel,
          label: fdef.editor?.header || fk,
        });
      }
    }

    const otherPk = Array.isArray(other?.primary_key) ? other.primary_key[0] : other?.primary_key;
    Object.entries(other?.fields || {}).forEach(([field, fdef]) => {
      if (fdef.design_only || fdef.type === "item_link" || field === otherPk) return;
      if (rel.storage === "junction") {
        candidates.push({
          id: `join:${rel.id}:${field}`,
          source: "join",
          relationship_id: rel.id,
          field,
          mode: "edit",
          group: groupLabel,
          label: `${fdef.editor?.header || field}`,
        });
      }
    });
  });

  return candidates;
}

export function isColumnIncluded(view, candidateId) {
  return (view.columns || []).some((c) => c.id === candidateId);
}

export function toggleColumnCandidate(view, schema, candidate) {
  ensureViewShape(view, schema);
  const idx = (view.columns || []).findIndex((c) => c.id === candidate.id);
  if (idx >= 0) {
    view.columns.splice(idx, 1);
    return false;
  }
  const { group, label, ...col } = candidate;
  view.columns.push(col);
  return true;
}

export function columnLabel(col, schema, view) {
  if (col.source === "primary") {
    const ent = schema.entity_types[view.entity];
    const fdef = ent?.fields?.[col.field];
    return fdef?.editor?.header || col.field || col.id;
  }
  if (col.field) {
    const rel = (schema.relationships || []).find((r) => r.id === col.relationship_id);
    const otherId = rel ? otherEntityInRel(rel, view.entity) : null;
    const other = otherId ? schema.entity_types[otherId] : null;
    const fdef = other?.fields?.[col.field];
    const base = fdef?.editor?.header || col.field;
    const group = other?.label;
    return group ? `${base} (${group})` : base;
  }
  const rel = (schema.relationships || []).find((r) => r.id === col.relationship_id);
  if (!rel) return col.relationship_id || col.id;
  return relationshipLabel(schema, rel, view.entity);
}

export function columnModeLabel(mode) {
  if (mode === "chip") return "Chips";
  if (mode === "view") return "Read-only";
  return "Editable";
}

export const COLUMN_MODE_OPTIONS = [
  { value: "edit", label: "Editable" },
  { value: "view", label: "Read-only" },
  { value: "chip", label: "Chips" },
];
