/** Entity-relationship diagram — draggable tables, auto-layout, optional junction nodes. */

import { friendlyFieldType } from "./design-actions.js";
import { isPrimaryKey } from "./field-presets.js";
import {
  MAP_PAD,
  autoLayoutPositions,
  ensureMapUi,
  estimateTableHeight,
  resetMapPositions,
} from "./map-layout.js";
import { storageLabel } from "./help-text.js";

const JUNCTION_PREFIX = "__junction__";

export function renderWorkspaceMap({
  container,
  schema,
  onChange,
  density = "simple",
  showJunctionTables = false,
  selectedEntityId = null,
  onSelectEntity = null,
  onResetLayout = null,
}) {
  let localSelected = selectedEntityId;
  let tableEls = {};
  let resizeObs = null;
  let dragState = null;

  function emit() {
    onChange(schema);
  }

  function selectEntity(id) {
    if (id?.startsWith(JUNCTION_PREFIX)) return;
    localSelected = id;
    if (onSelectEntity) onSelectEntity(id);
    else render();
  }

  function entityIds() {
    return Object.keys(schema.entity_types || {});
  }

  function baseRels() {
    return (schema.relationships || []).filter(
      (r) => schema.entity_types[r.from] && schema.entity_types[r.to]
    );
  }

  function fieldRows(entity, entityId, isJunction = false, rel = null) {
    if (isJunction && rel?.junction?.keys) {
      return rel.junction.keys.map((key) => [
        key,
        {
          type: "foreign_key",
          link_to: key.replace(/_id$/, ""),
          editor: { header: key },
        },
      ]);
    }
    return Object.entries(entity.fields || {}).filter(([fname, fdef]) => {
      if (fdef.design_only || fdef.type === "item_link") return false;
      if (density === "full") return true;
      if (isPrimaryKey(entity, fname)) return true;
      if (fdef.type === "foreign_key" && fdef.link_to) return true;
      return false;
    });
  }

  function renderTable(id, entity, { isJunction = false, rel = null } = {}) {
    const table = document.createElement("article");
    const selected = id === localSelected;
    table.className =
      "erd-table" +
      (selected ? " selected" : "") +
      (isJunction ? " erd-junction" : "");
    table.dataset.entityId = id;

    const head = document.createElement("header");
    head.className = "erd-table-head";
    head.title = isJunction ? "Drag to reposition" : "Drag header to reposition";
    head.innerHTML = isJunction
      ? `<span class="erd-junction-label">${escapeHtml(rel?.id || "link")}</span>`
      : escapeHtml(entity.label);
    table.appendChild(head);

    const body = document.createElement("div");
    body.className = "erd-table-body";
    const rows = fieldRows(entity, id, isJunction, rel);

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "erd-field-empty muted";
      empty.textContent = density === "simple" ? "No keys yet" : "No fields";
      body.appendChild(empty);
    } else {
      rows.forEach(([fname, fdef]) => {
        body.appendChild(renderFieldRow(isJunction ? { fields: {} } : entity, fname, fdef, isJunction));
      });
    }

    table.appendChild(body);

    if (!isJunction) {
      table.addEventListener("click", (e) => {
        if (e.target.closest("button") || dragState?.moved) return;
        selectEntity(id);
      });
    }

    bindDrag(head, table, id);
    return table;
  }

  function renderFieldRow(entity, fname, fdef, isJunction) {
    const row = document.createElement("div");
    row.className = "erd-field-row";

    const badge = document.createElement("span");
    badge.className = "erd-key-badge";
    if (isJunction || (fdef.type === "foreign_key" && fdef.link_to)) {
      badge.className += " erd-key-fk";
      badge.textContent = "FK";
    } else if (isPrimaryKey(entity, fname)) {
      badge.className += " erd-key-pk";
      badge.textContent = "PK";
    } else {
      badge.className += " erd-key-none";
      badge.textContent = "";
    }

    const name = document.createElement("span");
    name.className = "erd-field-name";
    name.textContent = fdef.editor?.header || fname;

    row.append(badge, name);

    if (density === "full" && !isJunction) {
      const type = document.createElement("span");
      type.className = "erd-field-type";
      type.textContent = friendlyFieldType(fdef.type);
      row.appendChild(type);
    }

    return row;
  }

  function bindDrag(handle, table, id) {
    handle.addEventListener("pointerdown", (e) => {
      if (id.startsWith(JUNCTION_PREFIX)) return;
      e.preventDefault();
      e.stopPropagation();
      const canvas = table.closest(".erd-canvas");
      const positions = ensureMapUi(schema);
      const start = positions[id] || { x: table.offsetLeft, y: table.offsetTop };
      dragState = {
        id,
        canvas,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: start.x,
        originY: start.y,
        moved: false,
      };
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener("pointermove", (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
      const positions = ensureMapUi(schema);
      positions[dragState.id] = {
        x: Math.max(MAP_PAD, dragState.originX + dx),
        y: Math.max(MAP_PAD, dragState.originY + dy),
      };
      applyPositions();
      redrawEdges();
    });

    const endDrag = (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      if (dragState.moved) emit();
      dragState = null;
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function anchorPoint(rect, targetX, targetY, containerRect) {
    const cx = rect.left + rect.width / 2 - containerRect.left;
    const cy = rect.top + rect.height / 2 - containerRect.top;
    const dx = targetX - cx;
    const dy = targetY - cy;
    if (Math.abs(dx) > Math.abs(dy)) {
      const x = dx > 0 ? rect.right - containerRect.left : rect.left - containerRect.left;
      const t = (x - cx) / (dx || 1);
      return { x, y: cy + dy * t };
    }
    const y = dy > 0 ? rect.bottom - containerRect.top : rect.top - containerRect.top;
    const t = (y - cy) / (dy || 1);
    return { x: cx + dx * t, y };
  }

  function drawCardinality(g, x, y, angle, kind, className = "erd-card-mark") {
    const gEl = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gEl.setAttribute(
      "transform",
      `translate(${x},${y}) rotate(${(angle * 180) / Math.PI})`
    );
    if (kind === "one") {
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "line");
      bar.setAttribute("x1", "0");
      bar.setAttribute("y1", "-5");
      bar.setAttribute("x2", "0");
      bar.setAttribute("y2", "5");
      bar.setAttribute("class", className);
      gEl.appendChild(bar);
    } else {
      [-4, 0, 4].forEach((off) => {
        const prong = document.createElementNS("http://www.w3.org/2000/svg", "line");
        prong.setAttribute("x1", "0");
        prong.setAttribute("y1", String(off));
        prong.setAttribute("x2", "8");
        prong.setAttribute("y2", String(off));
        prong.setAttribute("class", className);
        gEl.appendChild(prong);
      });
    }
    g.appendChild(gEl);
  }

  function orthogonalPathPoints(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const midX = (a.x + b.x) / 2;
      return [
        [a.x, a.y],
        [midX, a.y],
        [midX, b.y],
        [b.x, b.y],
      ];
    }
    const midY = (a.y + b.y) / 2;
    return [
      [a.x, a.y],
      [a.x, midY],
      [b.x, midY],
      [b.x, b.y],
    ];
  }

  function pathFromPoints(points) {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
      .join(" ");
  }

  function segmentAngle(from, to) {
    return Math.atan2(to[1] - from[1], to[0] - from[0]);
  }

  function drawEdge(svg, cRect, fromEl, toEl, rel, { active = false } = {}) {
    if (!fromEl || !toEl) return;
    const rA = fromEl.getBoundingClientRect();
    const rB = toEl.getBoundingClientRect();
    const acx = rA.left + rA.width / 2 - cRect.left;
    const acy = rA.top + rA.height / 2 - cRect.top;
    const bcx = rB.left + rB.width / 2 - cRect.left;
    const bcy = rB.top + rB.height / 2 - cRect.top;
    const a = anchorPoint(rA, bcx, bcy, cRect);
    const b = anchorPoint(rB, acx, acy, cRect);
    const points = orthogonalPathPoints(a, b);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathFromPoints(points));
    path.setAttribute("class", "erd-line" + (active ? " erd-line-active" : ""));
    path.setAttribute("fill", "none");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${rel.from} ${storageLabel(rel.storage)} ${rel.to}`;
    path.appendChild(title);
    svg.appendChild(path);

    const angleA = segmentAngle(points[0], points[1]);
    const angleB = segmentAngle(points[points.length - 2], points[points.length - 1]);
    const fromMark = rel.storage === "junction" ? "many" : "one";
    const markClass = active ? "erd-card-mark erd-card-mark-active" : "erd-card-mark";
    drawCardinality(svg, a.x, a.y, angleA, fromMark, markClass);
    drawCardinality(svg, b.x, b.y, angleB, "many", markClass);

    const midSeg = Math.floor((points.length - 1) / 2);
    const mx = (points[midSeg][0] + points[midSeg + 1][0]) / 2;
    const my = (points[midSeg][1] + points[midSeg + 1][1]) / 2;
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(mx));
    label.setAttribute("y", String(my - 4));
    label.setAttribute("class", "erd-line-label");
    label.textContent = storageLabel(rel.storage);
    svg.appendChild(label);
  }

  let svgEl = null;
  let canvasEl = null;
  let relsForDraw = [];

  function redrawEdges() {
    if (!svgEl || !canvasEl) return;
    const cRect = canvasEl.getBoundingClientRect();
    if (!cRect.width || !cRect.height) return;
    svgEl.setAttribute("viewBox", `0 0 ${cRect.width} ${cRect.height}`);
    svgEl.innerHTML = "";

    relsForDraw.forEach((rel) => {
      const active =
        localSelected === rel.from || localSelected === rel.to;
      if (showJunctionTables && rel.storage === "junction" && rel.junction) {
        const jId = JUNCTION_PREFIX + rel.id;
        const jEl = tableEls[jId];
        drawEdge(svgEl, cRect, tableEls[rel.from], jEl, rel, { active });
        drawEdge(svgEl, cRect, jEl, tableEls[rel.to], rel, { active });
      } else {
        drawEdge(svgEl, cRect, tableEls[rel.from], tableEls[rel.to], rel, { active });
      }
    });

    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvasEl) return;
    let maxX = 320;
    let maxY = 280;
    Object.values(tableEls).forEach((el) => {
      maxX = Math.max(maxX, el.offsetLeft + el.offsetWidth + MAP_PAD);
      maxY = Math.max(maxY, el.offsetTop + el.offsetHeight + MAP_PAD);
    });
    canvasEl.style.minWidth = maxX + "px";
    canvasEl.style.minHeight = maxY + "px";
  }

  function applyPositions() {
    const positions = ensureMapUi(schema);
    Object.entries(tableEls).forEach(([id, el]) => {
      if (id.startsWith(JUNCTION_PREFIX)) return;
      const pos = positions[id];
      if (!pos) return;
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
    });

    // Junction nodes sit at midpoint between parents
    if (showJunctionTables) {
      baseRels().forEach((rel) => {
        if (rel.storage !== "junction" || !rel.junction) return;
        const jId = JUNCTION_PREFIX + rel.id;
        const jEl = tableEls[jId];
        const a = tableEls[rel.from];
        const b = tableEls[rel.to];
        if (!jEl || !a || !b) return;
        jEl.style.left =
          (a.offsetLeft + b.offsetLeft) / 2 + a.offsetWidth / 4 + "px";
        jEl.style.top =
          (a.offsetTop + b.offsetTop) / 2 + a.offsetHeight / 4 + "px";
      });
    }
  }

  function layoutAll() {
    const ids = entityIds();
    const positions = ensureMapUi(schema);
    const fieldCounts = Object.fromEntries(
      ids.map((id) => {
        const ent = schema.entity_types[id];
        return [id, fieldRows(ent, id).length];
      })
    );
    const laid = autoLayoutPositions({
      entityIds: ids,
      relationships: baseRels(),
      positions,
      fieldCounts,
    });
    Object.assign(positions, laid);
  }

  function render() {
    if (resizeObs) {
      resizeObs.disconnect();
      resizeObs = null;
    }
    container.innerHTML = "";

    const entities = Object.entries(schema.entity_types || {});
    if (!entities.length) {
      const empty = document.createElement("p");
      empty.className = "erd-empty muted";
      empty.textContent = "Types you create will appear here as an entity diagram.";
      container.appendChild(empty);
      return;
    }

    relsForDraw = baseRels();
    layoutAll();

    const canvas = document.createElement("div");
    canvas.className = "erd-canvas";
    canvasEl = canvas;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "erd-lines");
    svg.setAttribute("aria-hidden", "true");
    svgEl = svg;

    const layer = document.createElement("div");
    layer.className = "erd-layer";

    tableEls = {};
    entities.forEach(([id, entity]) => {
      const table = renderTable(id, entity);
      layer.appendChild(table);
      tableEls[id] = table;
    });

    if (showJunctionTables) {
      relsForDraw.forEach((rel) => {
        if (rel.storage !== "junction" || !rel.junction) return;
        const jId = JUNCTION_PREFIX + rel.id;
        const pseudo = { label: rel.junction.table, fields: {} };
        const jTable = renderTable(jId, pseudo, { isJunction: true, rel });
        layer.appendChild(jTable);
        tableEls[jId] = jTable;
      });
    }

    canvas.append(svg, layer);
    container.appendChild(canvas);

    applyPositions();
    requestAnimationFrame(() => {
      redrawEdges();
      resizeObs = new ResizeObserver(redrawEdges);
      resizeObs.observe(canvas);
      resizeObs.observe(layer);
    });
  }

  render();

  return {
    refresh: render,
    setSelected(id) {
      localSelected = id;
      container.querySelectorAll(".erd-table").forEach((t) => {
        t.classList.toggle("selected", t.dataset.entityId === id);
      });
      redrawEdges();
    },
    resetLayout() {
      resetMapPositions(schema);
      layoutAll();
      applyPositions();
      redrawEdges();
      emit();
      if (onResetLayout) onResetLayout();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
