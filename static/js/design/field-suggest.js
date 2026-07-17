/** Match typed name to an existing Item type label or plural. */

export function matchEntityByName(schema, currentEntityId, name) {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  for (const [id, entity] of Object.entries(schema.entity_types || {})) {
    if (id === currentEntityId) continue;
    const labels = [entity.label, entity.label_plural]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    if (labels.includes(q)) return { id, entity };
  }
  return null;
}
