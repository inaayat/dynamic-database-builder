/** Schema-driven entity CRUD and junction link URLs. */

export function needsContainer(schema, entityId, view) {
  const entity = schema?.entity_types?.[entityId];
  return Boolean(entity?.primitive === "primary_row" && view?.container_entity);
}

export function containerQuery(containerId) {
  return containerId
    ? `?container_id=${encodeURIComponent(containerId)}`
    : "";
}

export function entityListUrl(entityId, containerId) {
  return `/api/entities/${encodeURIComponent(entityId)}${containerQuery(containerId)}`;
}

export function entityRowUrl(entityId, rowId, containerId) {
  return `/api/entities/${encodeURIComponent(entityId)}/${encodeURIComponent(rowId)}${containerQuery(containerId)}`;
}

export function entityLinksUrl(entityId, rowId, relationshipId, containerId) {
  return `/api/entities/${encodeURIComponent(entityId)}/${encodeURIComponent(rowId)}/links/${encodeURIComponent(relationshipId)}${containerQuery(containerId)}`;
}

export function linkedEntityId(schema, relationshipId, primaryEntityId) {
  const rel = (schema.relationships || []).find((r) => r.id === relationshipId);
  if (!rel) return null;
  if (rel.from === primaryEntityId) return rel.to;
  if (rel.to === primaryEntityId) return rel.from;
  return null;
}

export function rowLinkData(row, relationshipId) {
  return row?._links?.[relationshipId] || { ids: [], names: [] };
}

export function displayFieldForEntity(entity) {
  if (entity?.fields?.name) return "name";
  if (entity?.fields?.title) return "title";
  for (const [fname, fdef] of Object.entries(entity?.fields || {})) {
    if (fname === "id" || fname === "notebook_id") continue;
    if (["text", "enum", "url"].includes(fdef.type)) return fname;
  }
  return "id";
}

export function itemLabel(item, entity) {
  const field = displayFieldForEntity(entity);
  return item?.[field] ?? item?.id ?? "";
}

export function junctionContainerId(schema, relationshipId, notebookId, view) {
  const rel = (schema.relationships || []).find((r) => r.id === relationshipId);
  if (rel?.junction?.keys?.includes("notebook_id")) return notebookId;
  if (view?.container_entity) return notebookId;
  return null;
}

export function defaultNewRow(schema, entityId) {
  const entity = schema.entity_types?.[entityId];
  const body = {};
  Object.entries(entity?.fields || {}).forEach(([name, fdef]) => {
    if (name === "id" || name === "notebook_id") return;
    if (fdef.default !== undefined) body[name] = fdef.default;
  });
  if (!Object.keys(body).length) {
    if (entity?.fields?.title) body.title = `New ${entity.label || entityId}`;
    else if (entity?.fields?.name) body.name = `New ${entity.label || entityId}`;
    if (entity?.fields?.status) body.status = "draft";
    if (entity?.fields?.link) body.link = "https://example.com";
  }
  return body;
}
