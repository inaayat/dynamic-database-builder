/** Entity-relationship diagram — table boxes + connector lines. */

import { friendlyFieldType } from "./design-actions.js";
import { isPrimaryKey } from "./field-presets.js";
import { storageLabel } from "./help-text.js";

export function renderWorkspaceMap({
  container,
  schema,
  onChange,
  density = "simple", // simple | full
  selectedEntityId = null,
  onSelectEntity = null,
}) {
  let localSelected = selectedEntityId;
  let tableEls = {};
  let resizeObs = null;

  function emit() {
    onChange(schema);
    render();
  }

  function selectEntity(id) {
    localSelected = id;
    if (onSelectEntity) onSelectEntity(id);
    else render();
  }

  function fieldRows(entity, entityId) {
    return Object.entries(entity.fields || {}).filter(([fname, fdef]) => {
      if (fdef.design_only || fdef.type === "item_link") return false;
      if (density === "full") return true;
      if (isPrimaryKey(entity, fname)) return true;
      if (fdef.type === "foreign_key" && fdef.link_to) return true;
      return false;
    });
  }

  function renderTable(id, entity) {
    const table = document.createElement("article");
    table.className = "erd-table" + (id === localSelected ? " selected" : "");
    table.dataset.entityId = id;

    const head = document.createElement("header");
    head.className = "erd-table-head";
    head.textContent = entity.label;
    table.appendChild(head);

    const body = document.createElement("div");
    body.className = "erd-table-body";
    const rows = fieldRows(entity, id);

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "erd-field-empty muted";
      empty.textContent = density === "simple" ? "No keys yet" : "No fields";
      body.appendChild(empty);
    } else {
      rows.forEach(([fname, fdef]) => {
        body.appendChild(renderFieldRow(entity, fname, fdef));
      });
    }

    table.appendChild(body);
    table.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      selectEntity(id);
    });
    return table;
  }

  function renderFieldRow(entity, fname, fdef) {
    const row = document.createElement("div");
    row.className = "erd-field-row";

    const badge = document.createElement("span");
    badge.className = "erd-key-badge";
    if (isPrimaryKey(entity, fname)) {
      badge.className += " erd-key-pk";
      badge.textContent = "PK";
      badge.title = "Primary key";
    } else if (fdef.type === "foreign_key" && fdef.link_to) {
      badge.className += " erd-key-fk";
      badge.textContent = "FK";
      badge.title = `Links to ${fdef.link_to}`;
    } else {
      badge.className += " erd-key-none";
      badge.textContent = "";
    }

    const name = document.createElement("span");
    name.className = "erd-field-name";
    name.textContent = fdef.editor?.header || fname;

    row.appendChild(badge);
    row.appendChild(name);

    if (density === "full") {
      const type = document.createElement("span");
      type.className = "erd-field-type";
      type.textContent = friendlyFieldType(fdef.type);
      row.appendChild(type);
    }

    return row;
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

  function drawEdges(svg, canvas, rels) {
    const cRect = canvas.getBoundingClientRect();
    if (!cRect.width || !cRect.height) return;

    svg.setAttribute("viewBox", `0 0 ${cRect.width} ${cRect.height}`);
    svg.innerHTML = "";

    rels.forEach((rel) => {
      const elA = tableEls[rel.from];
      const elB = tableEls[rel.to];
      if (!elA || !elB) return;

      const rA = elA.getBoundingClientRect();
      const rB = elB.getBoundingClientRect();
      const acx = rA.left + rA.width / 2 - cRect.left;
      const acy = rA.top + rA.height / 2 - cRect.top;
      const bcx = rB.left + rB.width / 2 - cRect.left;
      const bcy = rB.top + rB.height / 2 - cRect.top;

      const a = anchorPoint(rA, bcx, bcy, cRect);
      const b = anchorPoint(rB, acx, acy, cRect);

      const active =
        localSelected === rel.from || localSelected === rel.to;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
      line.setAttribute("class", "erd-line" + (active ? " erd-line-active" : ""));

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${schema.entity_types[rel.from]?.label} ${storageLabel(rel.storage)} ${schema.entity_types[rel.to]?.label}`;
      line.appendChild(title);
      svg.appendChild(line);

      const angleA = Math.atan2(b.y - a.y, b.x - a.x);
      const angleB = Math.atan2(a.y - b.y, a.x - b.x);
      const fromMark = rel.storage === "junction" ? "many" : "one";
      const toMark = "many";
      const markClass = active ? "erd-card-mark erd-card-mark-active" : "erd-card-mark";
      drawCardinality(svg, a.x, a.y, angleA, fromMark, markClass);
      drawCardinality(svg, b.x, b.y, angleB, toMark, markClass);

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(mx));
      label.setAttribute("y", String(my - 4));
      label.setAttribute("class", "erd-line-label");
      label.textContent = storageLabel(rel.storage);
      svg.appendChild(label);
    });
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

    const rels = (schema.relationships || []).filter(
      (r) => schema.entity_types[r.from] && schema.entity_types[r.to]
    );

    const canvas = document.createElement("div");
    canvas.className = "erd-canvas";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "erd-lines");
    svg.setAttribute("aria-hidden", "true");

    const grid = document.createElement("div");
    grid.className = "erd-tables";

    tableEls = {};
    entities.forEach(([id, entity]) => {
      const table = renderTable(id, entity);
      grid.appendChild(table);
      tableEls[id] = table;
    });

    canvas.append(svg, grid);
    container.appendChild(canvas);

    const redraw = () => drawEdges(svg, canvas, rels);
    requestAnimationFrame(redraw);
    resizeObs = new ResizeObserver(redraw);
    resizeObs.observe(canvas);
    resizeObs.observe(grid);
  }

  render();
  return {
    refresh: render,
    setSelected(id) {
      localSelected = id;
      render();
    },
  };
}
