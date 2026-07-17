/** Match typed name to an existing Item type label or plural. */

import { slugify } from "./modals.js";

export function matchEntityByName(schema, currentEntityId, name) {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  for (const [id, entity] of Object.entries(schema.entity_types || {})) {
    if (id === currentEntityId) continue;
    const labels = [entity.label, entity.label_plural, id]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    if (labels.includes(q)) return { id, entity };
  }
  return null;
}

/** Resolve typed text to an Item type by label, plural, or id slug. */
export function resolveEntityByName(schema, currentEntityId, name) {
  const match = matchEntityByName(schema, currentEntityId, name);
  if (match) return match;
  const slug = slugify(name.trim());
  if (!slug || slug === currentEntityId) return null;
  const entity = schema.entity_types?.[slug];
  if (entity) return { id: slug, entity };
  return null;
}
