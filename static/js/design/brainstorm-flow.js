/** Brainstorm flow UI — Build → Review → Tabs. */

import {
  addDetailOnRecord,
  availableRecordLinks,
  CARDINALITY_LABELS,
  commitSuggestedKinds,
  compileToSchema,
  createBrainstormState,
  createConcept,
  defaultFieldTypeFromSchema,
  demoteToScalar,
  effectiveKind,
  FORMAT_OPTIONS,
  GHOST_CHIPS,
  itemConcepts,
  parseChipInput,
  placeRecordLink,
  placeScalar,
  promoteToItem,
  recordIdentityLabel,
  recordsOnRecord,
  removeConcept,
  removeRecordLink,
  scalarHasOpenSlots,
  scalarsAvailableForRecord,
  scalarsOnRecord,
  setConceptFieldType,
  stepBlockedReason,
  stepReady,
  STEP_COPY,
  suggestFieldType,
  unplacedScalars,
  unplaceScalar,
} from "./brainstorm.js";
import { renderWorkspaceTabsPanel } from "./workspace-tabs-panel.js";

const STEPS = ["setup", "review", "tabs"];

export function mountBrainstormFlow({
  container,
  baseSchema,
  onSchemaChange,
  onApply,
}) {
  const state = createBrainstormState();
  let stepIndex = 0;
  let workingSchema = null;
  let shouldFocusInput = false;

  function fieldTypeDefault() {
    return defaultFieldTypeFromSchema(baseSchema);
  }

  function conceptFieldType(concept) {
    return concept.fieldType || suggestFieldType(concept.label, fieldTypeDefault());
  }

  const shell = document.createElement("div");
  shell.className = "brainstorm-shell";

  const head = document.createElement("header");
  head.className = "brainstorm-head";
  const titleEl = document.createElement("h2");
  titleEl.className = "brainstorm-title";
  const coachEl = document.createElement("p");
  coachEl.className = "brainstorm-coach";
  head.append(titleEl, coachEl);

  const canvas = document.createElement("div");
  canvas.className = "brainstorm-canvas";

  const footer = document.createElement("footer");
  footer.className = "brainstorm-footer";

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
  footer.append(reasonEl, footerActions);

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

    backBtn.disabled = stepIndex === 0;
    nextBtn.textContent = step === "tabs" ? "Finish" : "Continue";

    const ready = stepReady(step, state);
    const reason = stepBlockedReason(step, state);
    nextBtn.disabled = !ready;
    reasonEl.textContent = ready ? "" : reason;

    canvas.innerHTML = "";
    canvas.className = "brainstorm-canvas brainstorm-canvas--" + step;

    if (step === "setup") renderSetup(canvas);
    else if (step === "review") renderReview(canvas);
    else if (step === "tabs") renderTabs(canvas);
  }

  backBtn.addEventListener("click", () => {
    stepIndex = Math.max(0, stepIndex - 1);
    render();
  });

  nextBtn.addEventListener("click", () => {
    if (!stepReady(currentStep(), state)) return;
    if (currentStep() === "setup") commitSuggestedKinds(state);
    if (currentStep() === "tabs") {
      syncSchema();
      onApply?.();
      return;
    }
    if (currentStep() === "review") syncSchema();
    stepIndex = Math.min(STEPS.length - 1, stepIndex + 1);
    render();
  });

  function addConcepts(labels, { keepFocus = false } = {}) {
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
    if (added) {
      shouldFocusInput = keepFocus;
      render();
    }
  }

  function bindConceptInput(input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const labels = parseChipInput(input.value);
        if (labels.length) {
          addConcepts(labels, { keepFocus: true });
          input.value = "";
        }
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        const labels = parseChipInput(input.value);
        if (labels.length) {
          addConcepts(labels, { keepFocus: true });
          input.value = "";
        }
      }
    });
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text") || "";
      if (text.includes("\n") || text.includes(",")) {
        e.preventDefault();
        addConcepts(parseChipInput(text), { keepFocus: true });
      }
    });
  }

  function bindDragPayload(el, payload) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/brainstorm-payload", payload);
    });
  }

  function handleDropOnCard(card, itemId, e) {
    e.preventDefault();
    card.classList.remove("brainstorm-record-card--dragover");
    const payload = e.dataTransfer.getData("text/brainstorm-payload");
    if (!payload) return;
    if (payload.startsWith("scalar:")) {
      const conceptId = payload.slice(7);
      const concept = state.concepts.find((c) => c.id === conceptId);
      if (concept) {
        const res = placeScalar(state, conceptId, itemId, conceptFieldType(concept));
        if (res.error) return;
        render();
      }
      return;
    }
    if (payload.startsWith("record:")) {
      const conceptId = payload.slice(7);
      if (conceptId === itemId) return;
      const res = placeRecordLink(state, itemId, conceptId, "many");
      if (res.error) alert(res.error);
      else render();
    }
  }

  function renderConceptRow(concept) {
    const row = document.createElement("div");
    row.className = "brainstorm-concept-row";
    row.dataset.conceptId = concept.id;

    const label = document.createElement("span");
    label.className = "brainstorm-concept-label";
    label.textContent = concept.label;

    const toggle = document.createElement("div");
    toggle.className = "brainstorm-toggle brainstorm-toggle--chip";
    toggle.setAttribute("role", "group");
    const kind = effectiveKind(concept);
    ["item", "scalar"].forEach((k) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "brainstorm-toggle-btn" + (kind === k ? " brainstorm-toggle-btn--active" : "");
      btn.textContent = k === "item" ? "Record" : "Detail";
      btn.title = k === "item" ? "You'll have many of these" : "Lives on a record";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (k === "item" && concept.kind === "scalar") promoteToItem(state, concept.id);
        else if (k === "scalar" && concept.kind === "item") {
          const warnings = demoteToScalar(state, concept.id);
          if (warnings.length && !confirm(warnings.join("\n"))) return;
        }
        concept.kind = k;
        render();
      });
      toggle.appendChild(btn);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "brainstorm-chip-remove";
    remove.setAttribute("aria-label", "Remove");
    remove.textContent = "×";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      removeConcept(state, concept.id);
      render();
    });

    if (kind === "scalar" && scalarHasOpenSlots(state, concept.id)) {
      row.classList.add("brainstorm-concept-row--draggable");
      bindDragPayload(row, `scalar:${concept.id}`);
      row.title = "Drag onto a record below (can be on multiple records)";
    }

    if (kind === "item") {
      row.classList.add("brainstorm-concept-row--draggable");
      bindDragPayload(row, `record:${concept.id}`);
      row.title = "Drag onto another record to store it as a value";
    }

    row.append(label, toggle, remove);
    return row;
  }

  function renderSetup(root) {
    const page = document.createElement("div");
    page.className = "brainstorm-setup-page";

    const inputRow = document.createElement("div");
    inputRow.className = "brainstorm-input-row brainstorm-input-row--top";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "brainstorm-input";
    input.placeholder = "Type a concept and press Enter…";
    input.autocomplete = "off";
    bindConceptInput(input);
    inputRow.appendChild(input);
    page.appendChild(inputRow);

    if (!state.concepts.length) {
      const ghosts = document.createElement("div");
      ghosts.className = "brainstorm-ghosts-row";
      GHOST_CHIPS.forEach((label) => {
        const g = document.createElement("button");
        g.type = "button";
        g.className = "brainstorm-chip brainstorm-chip--ghost";
        g.textContent = label;
        g.addEventListener("click", () => addConcepts([label], { keepFocus: true }));
        ghosts.appendChild(g);
      });
      page.appendChild(ghosts);
    }

    const chipArea = document.createElement("div");
    chipArea.className = "brainstorm-chips brainstorm-setup-chips";
    if (!state.concepts.length) {
      chipArea.appendChild(
        el("p", "muted brainstorm-chips-empty", "Concepts you add appear here.")
      );
    } else {
      state.concepts.forEach((c) => chipArea.appendChild(renderConceptRow(c)));
    }
    page.appendChild(chipArea);

    const hints = document.createElement("p");
    hints.className = "brainstorm-setup-hint muted";
    hints.textContent =
      "Records are things you track many of (Teacher, Class). Details are plain values (bio, due date) — add the same detail to as many records as you need.";
    page.appendChild(hints);

    const placeSection = document.createElement("section");
    placeSection.className = "brainstorm-setup-place";
    if (!itemConcepts(state).length) {
      placeSection.appendChild(
        el(
          "p",
          "muted brainstorm-setup-place-hint",
          "Mark at least one concept as a Record to start adding values."
        )
      );
    } else {
      renderPlace(placeSection);
    }
    page.appendChild(placeSection);

    root.appendChild(page);

    setTimeout(() => {
      const focusInput = page.querySelector(".brainstorm-input");
      if (shouldFocusInput || !state.concepts.length) {
        focusInput?.focus();
      }
      shouldFocusInput = false;
    }, 0);
  }

  function renderPlace(root) {
    const unplaced = unplacedScalars(state);
    const layout = document.createElement("div");
    layout.className = "brainstorm-place-layout";

    const tray = document.createElement("aside");
    tray.className = "brainstorm-tray";
    const trayHead = document.createElement("h3");
    trayHead.textContent = "Unplaced details";
    tray.appendChild(trayHead);

    const trayHint = document.createElement("p");
    trayHint.className = "muted brainstorm-tray-hint";
    trayHint.textContent =
      "Place each detail on at least one record. Search on a record card to reuse details elsewhere.";
    tray.appendChild(trayHint);

    if (!unplaced.length) {
      tray.appendChild(el("p", "muted", "All details placed."));
    } else {
      unplaced.forEach((c) => {
        const pill = document.createElement("div");
        pill.className = "brainstorm-detail-pill";
        pill.textContent = c.label;
        bindDragPayload(pill, `scalar:${c.id}`);
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
      card.addEventListener("drop", (e) => handleDropOnCard(card, item.id, e));

      const cardTitle = document.createElement("h3");
      cardTitle.textContent = item.label;
      card.appendChild(cardTitle);

      const fields = document.createElement("div");
      fields.className = "brainstorm-record-fields";

      const identity = document.createElement("div");
      identity.className = "brainstorm-value-row brainstorm-value-row--identity";
      const identityName = document.createElement("span");
      identityName.className = "brainstorm-value-name";
      identityName.textContent = recordIdentityLabel(item);
      const identityMeta = document.createElement("span");
      identityMeta.className = "brainstorm-value-meta muted";
      identityMeta.textContent = "Short text";
      identity.append(identityName, identityMeta);
      fields.appendChild(identity);

      scalarsOnRecord(state, item.id).forEach(({ placement, concept }) => {
        fields.appendChild(renderScalarValueRow(item.id, placement, concept));
      });

      recordsOnRecord(state, item.id).forEach(({ placement, concept }) => {
        fields.appendChild(renderRecordValueRow(item.id, placement, concept));
      });

      fields.appendChild(renderCardAddDetail(item.id));
      fields.appendChild(renderCardValueSearch(item.id));

      card.appendChild(fields);
      grid.appendChild(card);
    });

    layout.append(tray, grid);
    root.appendChild(layout);
  }

  function renderScalarValueRow(entityId, placement, concept) {
    const field = document.createElement("div");
    field.className = "brainstorm-value-row brainstorm-value-row--detail";

    const name = document.createElement("span");
    name.className = "brainstorm-value-name";
    name.textContent = concept.label;

    const fmt = document.createElement("select");
    fmt.className = "brainstorm-format-select";
    FORMAT_OPTIONS.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.type;
      o.textContent = opt.label;
      o.selected = (placement.fieldType || conceptFieldType(concept)) === opt.type;
      fmt.appendChild(o);
    });
    fmt.addEventListener("change", () => {
      setConceptFieldType(state, concept.id, fmt.value);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "brainstorm-chip-remove";
    remove.setAttribute("aria-label", "Remove");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      unplaceScalar(state, concept.id, entityId);
      render();
    });

    field.append(name, fmt, remove);
    return field;
  }

  function renderCardAddDetail(entityId) {
    const row = document.createElement("div");
    row.className = "brainstorm-card-add-detail";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "brainstorm-input brainstorm-card-add-input";
    input.placeholder = "Add detail…";
    input.autocomplete = "off";

    const commit = () => {
      const labels = parseChipInput(input.value);
      if (!labels.length) return;
      const errors = [];
      for (const label of labels) {
        const res = addDetailOnRecord(state, label, entityId);
        if (res.error) errors.push(res.error);
      }
      if (errors.length === labels.length) {
        alert(errors[0]);
        return;
      }
      input.value = "";
      render();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commit();
      }
    });
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text") || "";
      if (text.includes("\n") || text.includes(",")) {
        e.preventDefault();
        const labels = parseChipInput(text);
        const errors = [];
        for (const label of labels) {
          const res = addDetailOnRecord(state, label, entityId);
          if (res.error) errors.push(res.error);
        }
        if (errors.length && errors.length === labels.length) alert(errors[0]);
        else render();
      }
    });

    row.appendChild(input);
    return row;
  }

  function renderCardValueSearch(entityId) {
    const wrap = document.createElement("div");
    wrap.className = "brainstorm-value-search";

    const input = document.createElement("input");
    input.type = "search";
    input.className = "brainstorm-input brainstorm-value-search-input";
    input.placeholder = "Search to add…";
    input.autocomplete = "off";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", `value-search-${entityId}`);
    input.id = `value-search-input-${entityId}`;

    const results = document.createElement("div");
    results.className = "brainstorm-value-search-results";
    results.id = `value-search-${entityId}`;
    results.hidden = true;
    results.setAttribute("role", "listbox");

    let activeIndex = -1;
    let options = [];

    function buildOptions(query) {
      const q = query.trim().toLowerCase();
      const details = scalarsAvailableForRecord(state, entityId)
        .filter((concept) => !q || concept.label.toLowerCase().includes(q))
        .map((concept) => ({
          kind: "detail",
          concept,
          label: concept.label,
          meta: "Detail",
        }));
      const records = availableRecordLinks(state, entityId)
        .filter((concept) => !q || concept.label.toLowerCase().includes(q))
        .map((concept) => ({
          kind: "record",
          concept,
          label: concept.label,
          meta: "Record",
        }));
      return [...details, ...records];
    }

    function pick(option) {
      if (option.kind === "detail") {
        const res = placeScalar(
          state,
          option.concept.id,
          entityId,
          conceptFieldType(option.concept)
        );
        if (res.error) alert(res.error);
      } else {
        const res = placeRecordLink(state, entityId, option.concept.id, "many");
        if (res.error) alert(res.error);
      }
      input.value = "";
      activeIndex = -1;
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
      render();
    }

    function renderResults() {
      options = buildOptions(input.value);
      results.innerHTML = "";
      activeIndex = -1;

      if (!options.length) {
        if (!input.value.trim()) {
          results.hidden = true;
          input.setAttribute("aria-expanded", "false");
          return;
        }
        results.hidden = false;
        input.setAttribute("aria-expanded", "true");
        results.appendChild(
          el("p", "muted brainstorm-value-search-empty", "No matching details or records.")
        );
        return;
      }

      results.hidden = false;
      input.setAttribute("aria-expanded", "true");

      let lastKind = null;
      options.forEach((option, index) => {
        if (option.kind !== lastKind) {
          const head = document.createElement("p");
          head.className = "brainstorm-value-search-head muted";
          head.textContent = option.kind === "detail" ? "Details" : "Records";
          results.appendChild(head);
          lastKind = option.kind;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "brainstorm-value-search-option";
        btn.setAttribute("role", "option");
        btn.dataset.index = String(index);

        const label = document.createElement("span");
        label.className = "brainstorm-value-search-label";
        label.textContent = option.label;

        const meta = document.createElement("span");
        meta.className = "brainstorm-value-search-meta muted";
        meta.textContent = option.meta;

        btn.append(label, meta);
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => pick(option));
        results.appendChild(btn);
      });
    }

    function setActiveIndex(next) {
      const buttons = [...results.querySelectorAll(".brainstorm-value-search-option")];
      if (!buttons.length) {
        activeIndex = -1;
        return;
      }
      activeIndex = ((next % buttons.length) + buttons.length) % buttons.length;
      buttons.forEach((btn, i) => {
        btn.classList.toggle("active", i === activeIndex);
        if (i === activeIndex) btn.scrollIntoView({ block: "nearest" });
      });
    }

    input.addEventListener("focus", () => renderResults());
    input.addEventListener("input", () => renderResults());
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (results.hidden) renderResults();
        setActiveIndex(activeIndex + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(activeIndex <= 0 ? options.length - 1 : activeIndex - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && options[activeIndex]) pick(options[activeIndex]);
        else if (options.length === 1) pick(options[0]);
        return;
      }
      if (e.key === "Escape") {
        input.value = "";
        results.hidden = true;
        input.setAttribute("aria-expanded", "false");
        activeIndex = -1;
        results.innerHTML = "";
      }
    });
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!wrap.contains(document.activeElement)) {
          results.hidden = true;
          input.setAttribute("aria-expanded", "false");
          activeIndex = -1;
        }
      }, 120);
    });

    wrap.append(input, results);
    return wrap;
  }

  function renderRecordValueRow(entityId, placement, concept) {
    const field = document.createElement("div");
    field.className = "brainstorm-value-row brainstorm-value-row--record";

    const name = document.createElement("span");
    name.className = "brainstorm-value-name";
    name.textContent = concept.label;

    const badge = document.createElement("span");
    badge.className = "brainstorm-value-kind muted";
    badge.textContent = "Record";

    const cardSel = document.createElement("select");
    cardSel.className = "brainstorm-cardinality-select";
    Object.entries(CARDINALITY_LABELS).forEach(([k, v]) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = `${v.label} — ${v.hint}`;
      o.selected = (placement.cardinality || "many") === k;
      cardSel.appendChild(o);
    });
    cardSel.addEventListener("change", () => {
      placement.cardinality = cardSel.value;
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "brainstorm-chip-remove";
    remove.setAttribute("aria-label", "Remove");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      removeRecordLink(state, entityId, concept.id);
      render();
    });

    field.append(name, badge, cardSel, remove);
    return field;
  }

  function showPlaceMenu(concept) {
    const items = itemConcepts(state);
    if (!items.length) return;
    if (items.length === 1) {
      placeScalar(state, concept.id, items[0].id, conceptFieldType(concept));
      render();
      return;
    }
    showPickerMenu(
      "Place on which record?",
      items.map((item) => ({
        label: item.label,
        onPick: () => {
          placeScalar(state, concept.id, item.id, conceptFieldType(concept));
          render();
        },
      }))
    );
  }

  function showPickerMenu(title, items) {
    showSectionedMenu(canvas, [{ title, items }]);
  }

  function showSectionedMenu(anchor, sections) {
    document.querySelectorAll(".brainstorm-value-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "brainstorm-value-menu";
    sections.forEach((section) => {
      const head = document.createElement("p");
      head.className = "brainstorm-value-menu-head muted";
      head.textContent = section.title;
      menu.appendChild(head);
      section.items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "brainstorm-value-menu-btn";
        btn.textContent = item.label;
        btn.addEventListener("click", () => {
          menu.remove();
          item.onPick();
        });
        menu.appendChild(btn);
      });
    });

    if (anchor === canvas) {
      menu.classList.add("brainstorm-value-menu--centered");
      canvas.appendChild(menu);
    } else {
      const rect = anchor.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      menu.style.top = `${rect.bottom - canvasRect.top + 4}px`;
      menu.style.left = `${Math.max(0, rect.left - canvasRect.left)}px`;
      canvas.appendChild(menu);
    }

    setTimeout(() => {
      document.addEventListener(
        "click",
        (e) => {
          if (!menu.contains(e.target) && e.target !== anchor) menu.remove();
        },
        { once: true }
      );
    }, 0);
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

    itemConcepts(state).forEach((concept) => {
      const li = document.createElement("li");
      const valueParts = [recordIdentityLabel(concept)];
      scalarsOnRecord(state, concept.id).forEach(({ concept: detail }) => {
        valueParts.push(detail.label);
      });
      recordsOnRecord(state, concept.id).forEach(({ concept: linked }) => {
        valueParts.push(linked.label);
      });
      li.innerHTML = `<strong>${escapeHtml(concept.label)}</strong> <span class="muted">stores ${escapeHtml(valueParts.join(", "))}</span>`;
      itemList.appendChild(li);
    });
    items.appendChild(itemList);

    const links = document.createElement("section");
    links.className = "brainstorm-review-section";
    links.innerHTML = "<h3>Connections</h3>";
    const linkList = document.createElement("ul");
    linkList.className = "brainstorm-review-list";
    const linkPlacements = state.placements.filter((p) => p.linkTargetId);
    if (!linkPlacements.length) {
      linkList.innerHTML =
        "<li class='muted'>No record links yet — add another record as a value on a card.</li>";
    } else {
      linkPlacements.forEach((p) => {
        const from = state.concepts.find((c) => c.id === p.entityId);
        const to = state.concepts.find((c) => c.id === p.linkTargetId);
        const card = CARDINALITY_LABELS[p.cardinality || "many"];
        const li = document.createElement("li");
        li.innerHTML = `<strong>${escapeHtml(from?.label || "?")}</strong> stores <strong>${escapeHtml(to?.label || "?")}</strong> <span class="muted">${escapeHtml(card?.label || "")}</span>`;
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
    renderWorkspaceTabsPanel({
      container: panel,
      schema,
      onChange: (updated) => {
        workingSchema = updated;
        onSchemaChange?.(updated);
      },
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
