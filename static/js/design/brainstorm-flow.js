/** Brainstorm flow UI — Dump → Sort → Place → Link → Review → Tabs. */

import {
  addLink,
  commitSuggestedKinds,
  compileToSchema,
  createBrainstormState,
  createConcept,
  demoteToScalar,
  effectiveKind,
  FORMAT_OPTIONS,
  GHOST_CHIPS,
  itemConcepts,
  linksOnRecord,
  parseChipInput,
  placeScalar,
  promoteToItem,
  recordHasTitleLike,
  removeLink,
  scalarsOnRecord,
  scalarConcepts,
  stepBlockedReason,
  stepReady,
  STEP_COPY,
  suggestFieldType,
  unplacedScalars,
  unplaceScalar,
} from "./brainstorm.js";
import { renderStudioWorkspacePanel } from "./studio-workspace-panel.js";

const STEPS = ["dump", "sort", "place", "link", "review", "tabs"];

const CARDINALITY_LABELS = {
  many: { label: "Many", hint: "Can pick several" },
  one: { label: "One", hint: "At most one" },
  owned: { label: "Owned by", hint: "Belongs inside" },
};

export function mountBrainstormFlow({
  container,
  baseSchema,
  onSchemaChange,
  onOpenStudio,
  onApply,
}) {
  const state = createBrainstormState();
  let stepIndex = 0;
  let workingSchema = null;

  const shell = document.createElement("div");
  shell.className = "brainstorm-shell";

  const head = document.createElement("header");
  head.className = "brainstorm-head";
  const brand = document.createElement("div");
  brand.className = "brainstorm-brand";
  brand.textContent = "Design";
  const titleEl = document.createElement("h2");
  titleEl.className = "brainstorm-title";
  const coachEl = document.createElement("p");
  coachEl.className = "brainstorm-coach";
  head.append(brand, titleEl, coachEl);

  const canvas = document.createElement("div");
  canvas.className = "brainstorm-canvas";

  const footer = document.createElement("footer");
  footer.className = "brainstorm-footer";

  const escapeBtn = document.createElement("button");
  escapeBtn.type = "button";
  escapeBtn.className = "btn btn-sm brainstorm-escape";
  escapeBtn.textContent = "Open studio";
  escapeBtn.hidden = true;
  escapeBtn.addEventListener("click", () => {
    syncSchema();
    onOpenStudio?.(workingSchema);
  });

  const reasonEl = document.createElement("span");
  reasonEl.className = "brainstorm-footer-reason muted";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "btn";
  backBtn.textContent = "Back";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn btn-primary brainstorm-cta";
  nextBtn.textContent = "Continue";

  const footerActions = document.createElement("div");
  footerActions.className = "brainstorm-footer-actions";
  footerActions.append(backBtn, nextBtn);
  footer.append(escapeBtn, reasonEl, footerActions);

  shell.append(head, canvas, footer);
  container.innerHTML = "";
  container.appendChild(shell);

  function currentStep() {
    return STEPS[stepIndex];
  }

  function syncSchema() {
    workingSchema = compileToSchema(state, baseSchema);
    onSchemaChange?.(workingSchema);
    return workingSchema;
  }

  function render() {
    const step = currentStep();
    const copy = STEP_COPY[step];
    titleEl.textContent = copy.title;
    coachEl.textContent = copy.coach;

    escapeBtn.hidden = stepIndex < 1;
    backBtn.disabled = stepIndex === 0;
    nextBtn.textContent = step === "tabs" ? "Finish" : "Continue";

    const ready = stepReady(step, state);
    const reason = stepBlockedReason(step, state);
    nextBtn.disabled = !ready;
    reasonEl.textContent = ready ? "" : reason;

    canvas.innerHTML = "";
    canvas.className = "brainstorm-canvas brainstorm-canvas--" + step;

    if (step === "dump") renderDump(canvas);
    else if (step === "sort") renderSort(canvas);
    else if (step === "place") renderPlace(canvas);
    else if (step === "link") renderLink(canvas);
    else if (step === "review") renderReview(canvas);
    else if (step === "tabs") renderTabs(canvas);
  }

  backBtn.addEventListener("click", () => {
    stepIndex = Math.max(0, stepIndex - 1);
    render();
  });

  nextBtn.addEventListener("click", () => {
    if (!stepReady(currentStep(), state)) return;
    if (currentStep() === "sort") commitSuggestedKinds(state);
    if (currentStep() === "tabs") {
      syncSchema();
      onOpenStudio?.(workingSchema);
      return;
    }
    if (currentStep() === "review") syncSchema();
    stepIndex = Math.min(STEPS.length - 1, stepIndex + 1);
    render();
  });

  function addConcepts(labels) {
    let added = false;
    for (const label of labels) {
      const dup = state.concepts.some(
        (c) => c.label.toLowerCase() === label.toLowerCase()
      );
      if (dup) continue;
      const c = createConcept(label);
      if (c) {
        state.concepts.push(c);
        added = true;
      }
    }
    if (added) render();
  }

  function renderDump(root) {
    const chipArea = document.createElement("div");
    chipArea.className = "brainstorm-chips";

    if (!state.concepts.length) {
      const ghosts = document.createElement("div");
      ghosts.className = "brainstorm-ghosts";
      GHOST_CHIPS.forEach((label) => {
        const g = document.createElement("button");
        g.type = "button";
        g.className = "brainstorm-chip brainstorm-chip--ghost";
        g.textContent = label;
        g.addEventListener("click", () => addConcepts([label]));
        ghosts.appendChild(g);
      });
      chipArea.appendChild(ghosts);
    }

    state.concepts.forEach((c) => {
      chipArea.appendChild(renderChip(c, { removable: true }));
    });

    const inputRow = document.createElement("div");
    inputRow.className = "brainstorm-input-row";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "brainstorm-input";
    input.placeholder = "Add another…";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const labels = parseChipInput(input.value);
        if (labels.length) {
          addConcepts(labels);
          input.value = "";
        }
      }
    });
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text") || "";
      if (text.includes("\n") || text.includes(",")) {
        e.preventDefault();
        addConcepts(parseChipInput(text));
      }
    });
    inputRow.appendChild(input);
    root.append(chipArea, inputRow);
    setTimeout(() => input.focus(), 0);
  }

  function renderChip(concept, { removable = false, extra = null } = {}) {
    const chip = document.createElement("span");
    chip.className = "brainstorm-chip";
    chip.dataset.id = concept.id;
    chip.textContent = concept.label;
    if (removable) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "brainstorm-chip-remove";
      x.setAttribute("aria-label", "Remove");
      x.textContent = "×";
      x.addEventListener("click", () => {
        state.concepts = state.concepts.filter((c) => c.id !== concept.id);
        state.placements = state.placements.filter((p) => p.conceptId !== concept.id);
        state.links = (state.links || []).filter(
          (l) => l.fromConceptId !== concept.id && l.toConceptId !== concept.id
        );
        render();
      });
      chip.appendChild(x);
    }
    if (extra) chip.appendChild(extra);
    return chip;
  }

  function renderSort(root) {
    const progress = document.createElement("p");
    progress.className = "brainstorm-progress muted";
    const items = itemConcepts(state).length;
    const scalars = scalarConcepts(state).length;
    const unset = state.concepts.filter((c) => c.kind === "unset").length;
    progress.textContent =
      unset > 0
        ? `${state.concepts.length} concepts — pick Record or Detail for each`
        : `${items} record${items === 1 ? "" : "s"} · ${scalars} detail${scalars === 1 ? "" : "s"} — looking good`;

    const list = document.createElement("div");
    list.className = "brainstorm-sort-list";

    state.concepts.forEach((c) => {
      const row = document.createElement("div");
      row.className = "brainstorm-sort-row";

      const label = document.createElement("span");
      label.className = "brainstorm-sort-label";
      label.textContent = c.label;

      const toggle = document.createElement("div");
      toggle.className = "brainstorm-toggle";
      toggle.setAttribute("role", "group");

      const kind = effectiveKind(c);

      ["item", "scalar"].forEach((k) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "brainstorm-toggle-btn" + (kind === k ? " brainstorm-toggle-btn--active" : "");
        btn.textContent = k === "item" ? "Record" : "Detail";
        btn.title = k === "item" ? "You'll have many of these" : "Lives on a record";
        btn.addEventListener("click", () => {
          if (k === "item" && c.kind === "scalar") promoteToItem(state, c.id);
          else if (k === "scalar" && c.kind === "item") {
            const warnings = demoteToScalar(state, c.id);
            if (warnings.length && !confirm(warnings.join("\n"))) return;
          }
          c.kind = k;
          render();
        });
        toggle.appendChild(btn);
      });

      row.append(label, toggle);
      list.appendChild(row);
    });

    const hints = document.createElement("div");
    hints.className = "brainstorm-sort-hints muted";
    hints.innerHTML =
      "<span>Records: Note, Tag, Student, Class…</span><span>Details: title, description, due date…</span>";

    root.append(progress, list, hints);
  }

  function renderPlace(root) {
    const unplaced = unplacedScalars(state);
    const layout = document.createElement("div");
    layout.className = "brainstorm-place-layout";

    const tray = document.createElement("aside");
    tray.className = "brainstorm-tray";
    const trayHead = document.createElement("h3");
    trayHead.textContent = "Details";
    tray.appendChild(trayHead);

    if (!unplaced.length) {
      tray.appendChild(el("p", "muted", "All details placed."));
    } else {
      unplaced.forEach((c) => {
        const pill = document.createElement("div");
        pill.className = "brainstorm-detail-pill";
        pill.draggable = true;
        pill.dataset.conceptId = c.id;
        pill.textContent = c.label;
        pill.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/concept-id", c.id);
        });
        pill.addEventListener("click", () => showPlaceMenu(c));
        tray.appendChild(pill);
      });
    }

    const grid = document.createElement("div");
    grid.className = "brainstorm-record-grid";

    itemConcepts(state).forEach((item) => {
      const card = document.createElement("div");
      card.className = "brainstorm-record-card";
      card.dataset.entityId = item.id;

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        card.classList.add("brainstorm-record-card--dragover");
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("brainstorm-record-card--dragover");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("brainstorm-record-card--dragover");
        const conceptId = e.dataTransfer.getData("text/concept-id");
        const concept = state.concepts.find((c) => c.id === conceptId);
        if (concept) {
          placeScalar(state, conceptId, item.id, suggestFieldType(concept.label));
          render();
        }
      });

      const cardTitle = document.createElement("h3");
      cardTitle.textContent = item.label;
      card.appendChild(cardTitle);

      const fields = document.createElement("div");
      fields.className = "brainstorm-record-fields";

      scalarsOnRecord(state, item.id).forEach(({ placement, concept }) => {
        const field = document.createElement("div");
        field.className = "brainstorm-placed-detail";

        const name = document.createElement("span");
        name.textContent = concept.label;

        const fmt = document.createElement("select");
        fmt.className = "brainstorm-format-select";
        FORMAT_OPTIONS.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.type;
          o.textContent = opt.label;
          o.selected = placement.fieldType === opt.type;
          fmt.appendChild(o);
        });
        fmt.addEventListener("change", () => {
          placement.fieldType = fmt.value;
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "brainstorm-chip-remove";
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          unplaceScalar(state, concept.id);
          render();
        });

        field.append(name, fmt, remove);
        fields.appendChild(field);
      });

      if (!recordHasTitleLike(state, item.id)) {
        const hint = document.createElement("p");
        hint.className = "brainstorm-card-hint muted";
        hint.textContent = "Add a title or name detail";
        fields.appendChild(hint);
      }

      card.appendChild(fields);
      grid.appendChild(card);
    });

    layout.append(tray, grid);
    root.appendChild(layout);
  }

  function showPlaceMenu(concept) {
    const items = itemConcepts(state);
    if (!items.length) return;
    const pick = items.length === 1 ? items[0] : null;
    if (pick) {
      placeScalar(state, concept.id, pick.id, suggestFieldType(concept.label));
      render();
      return;
    }
    const menu = document.createElement("div");
    menu.className = "brainstorm-place-menu";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm";
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        placeScalar(state, concept.id, item.id, suggestFieldType(concept.label));
        menu.remove();
        render();
      });
      menu.appendChild(btn);
    });
    canvas.appendChild(menu);
    setTimeout(() => {
      document.addEventListener(
        "click",
        () => menu.remove(),
        { once: true }
      );
    }, 0);
  }

  function renderLink(root) {
    const grid = document.createElement("div");
    grid.className = "brainstorm-record-grid";

    itemConcepts(state).forEach((item) => {
      const card = document.createElement("div");
      card.className = "brainstorm-record-card";

      const cardTitle = document.createElement("h3");
      cardTitle.textContent = item.label;
      card.appendChild(cardTitle);

      const existing = document.createElement("div");
      existing.className = "brainstorm-links-list";

      linksOnRecord(state, item.id).forEach((link) => {
        const target = state.concepts.find((c) => c.id === link.toConceptId);
        if (!target) return;
        const row = document.createElement("div");
        row.className = "brainstorm-link-row";

        const label = document.createElement("span");
        label.textContent = target.label;

        const cardSel = document.createElement("select");
        cardSel.className = "brainstorm-cardinality-select";
        Object.entries(CARDINALITY_LABELS).forEach(([k, v]) => {
          const o = document.createElement("option");
          o.value = k;
          o.textContent = `${v.label} — ${v.hint}`;
          o.selected = (link.cardinality || "many") === k;
          cardSel.appendChild(o);
        });
        cardSel.addEventListener("change", () => {
          link.cardinality = cardSel.value;
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "brainstorm-chip-remove";
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          removeLink(state, item.id, link.toConceptId);
          render();
        });

        row.append(label, cardSel, remove);
        existing.appendChild(row);
      });

      card.appendChild(existing);

      const addRow = document.createElement("div");
      addRow.className = "brainstorm-link-add";
      const sel = document.createElement("select");
      sel.innerHTML = "<option value=''>Connect another record…</option>";
      itemConcepts(state)
        .filter((c) => c.id !== item.id)
        .forEach((c) => {
          const linked = linksOnRecord(state, item.id).some(
            (l) => l.toConceptId === c.id
          );
          if (linked) return;
          const o = document.createElement("option");
          o.value = c.id;
          o.textContent = c.label;
          sel.appendChild(o);
        });
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-sm";
      addBtn.textContent = "Add";
      addBtn.addEventListener("click", () => {
        if (!sel.value) return;
        const res = addLink(state, item.id, sel.value, "many");
        if (res.error) alert(res.error);
        else render();
      });
      addRow.append(sel, addBtn);
      card.appendChild(addRow);
      grid.appendChild(card);
    });

    root.appendChild(grid);
  }

  function renderReview(root) {
    const schema = syncSchema();
    const summary = document.createElement("div");
    summary.className = "brainstorm-review";

    const items = document.createElement("section");
    items.className = "brainstorm-review-section";
    items.innerHTML = "<h3>Records</h3>";
    const itemList = document.createElement("ul");
    itemList.className = "brainstorm-review-list";
    Object.values(schema.entity_types || {}).forEach((ent) => {
      const li = document.createElement("li");
      const fields = Object.entries(ent.fields || {})
        .filter(([k, f]) => k !== "id" && f.type !== "foreign_key")
        .map(([k, f]) => f.editor?.header || k);
      li.innerHTML = `<strong>${escapeHtml(ent.label)}</strong> <span class="muted">${escapeHtml(fields.join(", ") || "title")}</span>`;
      itemList.appendChild(li);
    });
    items.appendChild(itemList);

    const links = document.createElement("section");
    links.className = "brainstorm-review-section";
    links.innerHTML = "<h3>Inferred links</h3>";
    const linkList = document.createElement("ul");
    linkList.className = "brainstorm-review-list";
    if (!(schema.relationships || []).length) {
      linkList.innerHTML = "<li class='muted'>No links yet — you can add them in the next step or in studio.</li>";
    } else {
      (schema.relationships || []).forEach((rel) => {
        const from = schema.entity_types[rel.from]?.label || rel.from;
        const to = schema.entity_types[rel.to]?.label || rel.to;
        const li = document.createElement("li");
        li.innerHTML = `<strong>${escapeHtml(from)}</strong> ↔ <strong>${escapeHtml(to)}</strong> <span class="muted">${escapeHtml(rel.storage)}</span>`;
        linkList.appendChild(li);
      });
    }
    links.appendChild(linkList);

    summary.append(items, links);
    root.appendChild(summary);
  }

  function renderTabs(root) {
    const schema = syncSchema();
    const panel = document.createElement("div");
    panel.className = "brainstorm-tabs-panel";
    renderStudioWorkspacePanel({
      container: panel,
      schema,
      onChange: (updated) => {
        workingSchema = updated;
        onSchemaChange?.(updated);
      },
      variant: "inline",
    });
    root.appendChild(panel);
  }

  render();

  return {
    getSchema() {
      return workingSchema || compileToSchema(state, baseSchema);
    },
    getState() {
      return state;
    },
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
