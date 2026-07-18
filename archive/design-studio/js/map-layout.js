/** Auto-layout for ERD map — layered grid with spacing constants. */

export const MAP_PAD = 24;
export const MAP_GAP_X = 48;
export const MAP_GAP_Y = 40;
export const MAP_TABLE_W = 176;

export function ensureMapUi(schema) {
  schema.ui = schema.ui || {};
  schema.ui.map = schema.ui.map || {};
  schema.ui.map.positions = schema.ui.map.positions || {};
  return schema.ui.map.positions;
}

/** Estimate table height from field count (px). */
export function estimateTableHeight(fieldCount) {
  const head = 36;
  const row = 28;
  const minBody = 32;
  const body = fieldCount ? fieldCount * row : minBody;
  return head + body + 8;
}

/**
 * Auto-place entities missing positions. Existing positions are kept.
 * Returns updated positions map (mutates copy in place).
 */
export function autoLayoutPositions({
  entityIds,
  relationships,
  positions,
  fieldCounts = {},
}) {
  const next = { ...positions };
  const missing = entityIds.filter((id) => !next[id]);
  if (!missing.length) return next;

  const adj = buildAdjacency(entityIds, relationships);
  const layers = rankLayers(entityIds, relationships, adj);

  const layerBuckets = new Map();
  Object.entries(layers).forEach(([id, layer]) => {
    if (!layerBuckets.has(layer)) layerBuckets.set(layer, []);
    layerBuckets.get(layer).push(id);
  });

  const sortedLayers = [...layerBuckets.keys()].sort((a, b) => a - b);
  let cursorY = MAP_PAD;

  sortedLayers.forEach((layer) => {
    const ids = layerBuckets.get(layer);
    let rowY = cursorY;
    ids.forEach((id) => {
      if (next[id]) return;
      const x = MAP_PAD + layer * (MAP_TABLE_W + MAP_GAP_X);
      const h = estimateTableHeight(fieldCounts[id] || 2);
      next[id] = { x, y: rowY };
      rowY += h + MAP_GAP_Y;
    });
    cursorY = Math.max(cursorY, rowY);
  });

  // Place any still-missing (disconnected) nodes below the grid
  missing.forEach((id, i) => {
    if (next[id]) return;
    const anchor = findLinkedPosition(id, relationships, next);
    if (anchor) {
      next[id] = {
        x: anchor.x + MAP_TABLE_W + MAP_GAP_X,
        y: anchor.y,
      };
      return;
    }
    next[id] = {
      x: MAP_PAD + (i % 3) * (MAP_TABLE_W + MAP_GAP_X),
      y: cursorY + Math.floor(i / 3) * (estimateTableHeight(fieldCounts[id] || 2) + MAP_GAP_Y),
    };
  });

  return next;
}

function buildAdjacency(entityIds, relationships) {
  const adj = Object.fromEntries(entityIds.map((id) => [id, new Set()]));
  relationships.forEach((rel) => {
    if (adj[rel.from]) adj[rel.from].add(rel.to);
    if (adj[rel.to]) adj[rel.to].add(rel.from);
  });
  return adj;
}

function rankLayers(entityIds, relationships, adj) {
  const scores = Object.fromEntries(entityIds.map((id) => [id, 0]));
  relationships.forEach((rel) => {
    if (rel.storage === "containment") {
      scores[rel.from] = (scores[rel.from] || 0) + 2;
    }
    scores[rel.from] = (scores[rel.from] || 0) + 1;
    scores[rel.to] = (scores[rel.to] || 0) + 1;
  });

  const roots = [...entityIds].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
  const layers = {};
  const queue = roots.length ? [roots[0]] : [];
  layers[queue[0]] = 0;

  while (queue.length) {
    const id = queue.shift();
    const layer = layers[id];
    (adj[id] ? [...adj[id]] : []).forEach((nb) => {
      if (layers[nb] != null) return;
      layers[nb] = layer + 1;
      queue.push(nb);
    });
  }

  entityIds.forEach((id, i) => {
    if (layers[id] == null) layers[id] = i % 3;
  });
  return layers;
}

function findLinkedPosition(id, relationships, positions) {
  for (const rel of relationships) {
    if (rel.from === id && positions[rel.to]) return positions[rel.to];
    if (rel.to === id && positions[rel.from]) return positions[rel.from];
  }
  return null;
}

export function resetMapPositions(schema) {
  const positions = ensureMapUi(schema);
  Object.keys(positions).forEach((k) => delete positions[k]);
}
