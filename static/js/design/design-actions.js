/** Shared Design actions — Items only; never auto-create Item types. */

import {
  defaultEntity,
  defaultFieldDef,
  defaultLinkField,
  isPrimaryKey,
  ITEM_PRIMITIVE,
} from "./field-presets.js";
import {
  helpParagraph,
  STORAGE_HELP,
  storageLabel,
} from "./help-text.js";
import { openModal, slugify } from "./modals.js";
import { buildCustomConnection, suggestConnections } from "./recipes.js";

export const FIELD_CATALOG = [
  { type: "text", label: "Text", hint: "Short line — title, name" },
  { type: "longtext", label: "Long text", hint: "Paragraph — summary, notes" },
  { type: "multiline_text", label: "Multi-line text", hint: "Several lines" },
  { type: "bullet_list", label: "Bullet list", hint: "Outline-style points" },
  { type: "enum", label: "Choice list", hint: "Fixed options — status, priority" },
  { type: "url", label: "Link (URL)", hint: "Website address" },
  { type: "date", label: "Date", hint: "Calendar day" },
  { type: "boolean", label: "Checkbox", hint: "Yes / no" },
  { type: "integer", label: "Whole number", hint: "Count" },
  { type: "number", label: "Number", hint: "Decimal values" },
];

export function friendlyFieldType(type) {
  if (type === "foreign_key" || type === "item_link") return "Link";
  return FIELD_CATALOG.find((f) => f.type === type)?.label || type;
}

export function entityLabelsFromName(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (/s$/i.test(trimmed) && trimmed.length > 1) {
    const singular = trimmed.replace(/s$/i, "");
    return {
      label: singular.charAt(0).toUpperCase() + singular.slice(1),
      label_plural: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
    };
  }
  const label = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return { label, label_plural: label + "s" };
}

/** Create a type in schema; returns { id } or { error }. */
export function createItemType(schema, name) {
  const labels = entityLabelsFromName(name);
  if (!labels) return { error: "Enter a name." };
  const id = slugify(name);
  if (!id) return { error: "Enter a valid name." };
  if (schema.entity_types?.[id]) return { error: "That type already exists." };
  const entity = defaultEntity(ITEM_PRIMITIVE, id);
  entity.label = labels.label;
  entity.label_plural = labels.label_plural;
  schema.entity_types = schema.entity_types || {};
  schema.entity_types[id] = entity;
  return { id };
}

export function updateFieldLabel(entity, fieldName, label) {
  const field = entity.fields?.[fieldName];
  if (!field) return;
  field.editor = field.editor || {};
  field.editor.header = label.trim() || fieldName;
}

export function addValueToEntity(schema, entityId, { label, type }) {
  const entity = schema.entity_types[entityId];
  if (!entity) return { error: "Type not found." };
  const trimmed = label?.trim();
  if (!trimmed) return { error: "Enter a label." };
  const name = slugify(trimmed);
  if (entity.fields[name]) return { error: "That field already exists." };
  entity.fields[name] = defaultFieldDef(type, trimmed);
  const gridView = (schema.views || []).find((v) => v.type === "grid" && v.entity === entityId);
  if (gridView && entity.fields[name].editor?.column) {
    gridView.columns_from_fields = gridView.columns_from_fields || [];
    if (!gridView.columns_from_fields.includes(name)) {
      gridView.columns_from_fields.push(name);
    }
  }
  return { kind: "value", field: name };
}

export function addLinkToEntity(schema, entityId, opts) {
  const entity = schema.entity_types[entityId];
  if (!entity) return { error: "Type not found." };
  const trimmed = opts.label?.trim();
  if (!trimmed) return { error: "Enter a label." };

  let targetId = opts.targetId;
  let newLabel = opts.newLabel || trimmed;
  if (opts.createNew) {
    const created = createItemType(schema, newLabel);
    if (created.error) return created;
    targetId = created.id;
  }
  if (!targetId || !schema.entity_types[targetId]) {
    return { error: "Pick a type to link to." };
  }

  const from = entityId;
  const to = targetId;
  const storage = opts.storage || "junction";
  const rel = buildCustomConnection({
    from: storage === "containment" ? from : to,
    to: storage === "containment" ? to : from,
    storage,
    mirror: false,
    schema,
  });

  if (storage === "junction") {
    rel.from = to;
    rel.to = from;
    rel.id = `${to}_links_${from}`;
    const fromE = schema.entity_types[from];
    const toE = schema.entity_types[to];
    rel.junction = {
      table: `${toE.table}_${fromE.table}_links`.replace(/s_/g, "_").slice(0, 40),
      keys: [`${to}_id`, `${from}_id`],
    };
  } else if (storage === "containment") {
    rel.from = from;
    rel.to = to;
    rel.id = `${from}_contains_${to}`;
    const child = schema.entity_types[to];
    const linkName = `${from}_id`;
    if (!child.fields[linkName]) {
      child.fields[linkName] = defaultLinkField(from, entity.label);
    }
  } else if (storage === "assignment") {
    rel.from = from;
    rel.to = to;
    rel.id = `${from}_assigns_${to}`;
    const linkName = `${to}_id`;
    if (!entity.fields[linkName]) {
      entity.fields[linkName] = defaultLinkField(to, schema.entity_types[to].label);
    }
  }

  schema.relationships = schema.relationships || [];
  if (schema.relationships.some((r) => r.id === rel.id)) {
    return { error: "That link already exists." };
  }
  schema.relationships.push(rel);

  const markerName = slugify(trimmed);
  if (!entity.fields[markerName] && storage === "junction") {
    entity.fields[markerName] = {
      type: "item_link",
      link_entity: to,
      relationship_id: rel.id,
      editor: { column: true, header: trimmed, widget: "item_chips" },
      publish: false,
      design_only: true,
    };
  }

  return { kind: "link", targetId: to, relationshipId: rel.id };
}

export function removeRelationship(schema, relId) {
  schema.relationships = (schema.relationships || []).filter((r) => r.id !== relId);
}

export async function promptAddEntity(schema) {
  return promptAddItem(schema);
}

export async function promptAddItem(schema) {
  const result = await openModal({
    title: "Create an Item type",
    confirmLabel: "Create Item",
    wide: true,
    body(root) {
      root.appendChild(
        helpParagraph(
          "Name the kind of record you want to track (e.g. Student, Note, Class). Nothing else is created until you confirm."
        )
      );
      const nameLabel = document.createElement("label");
      nameLabel.className = "design-form-row";
      nameLabel.innerHTML = "<span>Name</span>";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "e.g. Students, Notes, Rubrics";
      nameInput.id = "item-name";
      nameLabel.appendChild(nameInput);
      root.appendChild(nameLabel);
      setTimeout(() => nameInput.focus(), 0);
    },
    onConfirm(root) {
      const name = root.querySelector("#item-name").value.trim();
      const created = createItemType(schema, name);
      if (created.error) {
        alert(created.error);
        return false;
      }
      return created;
    },
  });
  return result?.id || null;
}

/**
 * Add information to an Item: simple value OR link to other Items
 * (explicitly create / pick Item type + relationship — never auto).
 */
export async function promptAddInfo(schema, entityId) {
  const entity = schema.entity_types[entityId];
  if (!entity) return null;

  let mode = "value"; // value | link
  let chosenType = "text";
  let storage = "junction";

  const result = await openModal({
    title: `Add info to ${entity.label}`,
    confirmLabel: "Add",
    wide: true,
    body(root) {
      root.appendChild(helpParagraph("Is this a simple value, or a link to other Items?"));

      const modeCards = document.createElement("div");
      modeCards.className = "choice-cards";
      const valueCard = document.createElement("button");
      valueCard.type = "button";
      valueCard.className = "choice-card selected";
      valueCard.innerHTML =
        "<strong>Value on this Item</strong><p class='muted'>Text, date, choice list, number…</p>";
      const linkCard = document.createElement("button");
      linkCard.type = "button";
      linkCard.className = "choice-card";
      linkCard.innerHTML =
        "<strong>Link to other Items</strong><p class='muted'>You choose or create the Item type and relationship.</p>";
      modeCards.append(valueCard, linkCard);
      root.appendChild(modeCards);

      const nameLabel = document.createElement("label");
      nameLabel.className = "design-form-row";
      nameLabel.innerHTML = "<span>Label</span>";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "e.g. Title, Status, Students";
      nameInput.id = "info-name";
      nameLabel.appendChild(nameInput);
      root.appendChild(nameLabel);

      const valueBlock = document.createElement("div");
      valueBlock.id = "value-block";
      const typeCards = document.createElement("div");
      typeCards.className = "choice-cards";
      FIELD_CATALOG.forEach((f) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "choice-card" + (f.type === chosenType ? " selected" : "");
        card.innerHTML = `<strong>${f.label}</strong><p class="muted">${f.hint}</p>`;
        card.addEventListener("click", () => {
          chosenType = f.type;
          typeCards.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        });
        typeCards.appendChild(card);
      });
      valueBlock.appendChild(typeCards);
      root.appendChild(valueBlock);

      const linkBlock = document.createElement("div");
      linkBlock.id = "link-block";
      linkBlock.hidden = true;
      linkBlock.appendChild(
        helpParagraph("Create a new Item type or use an existing one. Nothing is created until you click Add.")
      );

      const targetMode = document.createElement("label");
      targetMode.className = "design-form-row";
      targetMode.innerHTML = "<span>Item type</span>";
      const targetSel = document.createElement("select");
      targetSel.id = "link-target-mode";
      const optNew = document.createElement("option");
      optNew.value = "__new__";
      optNew.textContent = "Create new Item type…";
      targetSel.appendChild(optNew);
      Object.entries(schema.entity_types || {}).forEach(([id, e]) => {
        if (id === entityId) return;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = e.label_plural || e.label;
        targetSel.appendChild(opt);
      });
      targetMode.appendChild(targetSel);
      linkBlock.appendChild(targetMode);

      const newNameRow = document.createElement("label");
      newNameRow.className = "design-form-row";
      newNameRow.id = "new-item-row";
      newNameRow.innerHTML = "<span>New name</span>";
      const newName = document.createElement("input");
      newName.type = "text";
      newName.id = "new-item-name";
      newName.placeholder = "e.g. Student";
      newNameRow.appendChild(newName);
      linkBlock.appendChild(newNameRow);

      targetSel.addEventListener("change", () => {
        newNameRow.hidden = targetSel.value !== "__new__";
      });

      const relLabel = document.createElement("p");
      relLabel.className = "design-help";
      relLabel.textContent = "How do they relate?";
      linkBlock.appendChild(relLabel);

      const relCards = document.createElement("div");
      relCards.className = "choice-cards";
      ["junction", "containment", "assignment"].forEach((id) => {
        const help = STORAGE_HELP[id];
        const card = document.createElement("button");
        card.type = "button";
        card.className = "choice-card" + (id === storage ? " selected" : "");
        card.innerHTML = `<strong>${help.label}</strong><p class="muted">${help.summary}</p>`;
        card.addEventListener("click", () => {
          storage = id;
          relCards.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        });
        relCards.appendChild(card);
      });
      linkBlock.appendChild(relCards);
      root.appendChild(linkBlock);

      function setMode(next) {
        mode = next;
        valueCard.classList.toggle("selected", mode === "value");
        linkCard.classList.toggle("selected", mode === "link");
        valueBlock.hidden = mode !== "value";
        linkBlock.hidden = mode !== "link";
        if (mode === "link" && !nameInput.value.trim()) {
          nameInput.placeholder = "e.g. Students, Teachers";
        }
      }
      valueCard.addEventListener("click", () => setMode("value"));
      linkCard.addEventListener("click", () => setMode("link"));
      setTimeout(() => nameInput.focus(), 0);
    },
    onConfirm(root) {
      const label = root.querySelector("#info-name").value.trim();
      if (!label) {
        alert("Enter a label.");
        return false;
      }
      if (mode === "value") {
        const name = slugify(label);
        if (entity.fields[name]) {
          alert("That field already exists.");
          return false;
        }
        return { kind: "value", name, label, type: chosenType };
      }

      const targetMode = root.querySelector("#link-target-mode").value;
      let targetId = targetMode;
      let createNew = false;
      let newLabel = label;
      if (targetMode === "__new__") {
        const typed = root.querySelector("#new-item-name").value.trim() || label;
        targetId = slugify(typed);
        newLabel = typed;
        createNew = true;
        if (!targetId) {
          alert("Enter a name for the new Item type.");
          return false;
        }
        if (schema.entity_types[targetId]) {
          alert("That Item type already exists — pick it from the list instead.");
          return false;
        }
      }
      return {
        kind: "link",
        label,
        targetId,
        createNew,
        newLabel,
        storage,
        fromId: entityId,
      };
    },
  });

  if (!result) return null;

  if (result.kind === "value") {
    return addValueToEntity(schema, entityId, result);
  }

  return addLinkToEntity(schema, entityId, {
    label: result.label,
    targetId: result.targetId,
    createNew: result.createNew,
    newLabel: result.newLabel,
    storage: result.storage,
  });
}

export async function promptAddField(schema, entityId) {
  return promptAddInfo(schema, entityId);
}

export async function promptAddConnection(schema) {
  const ids = Object.keys(schema.entity_types || {});
  if (ids.length < 2) {
    alert("Create at least two Item types first.");
    return null;
  }

  const recipes = suggestConnections(schema).filter((r) => !r.alreadyAdded);
  let storage = "junction";
  let mode = recipes.length ? "suggested" : "custom";
  let selectedRecipeId = recipes[0]?.id || null;

  const result = await openModal({
    title: "Add a connection",
    confirmLabel: "Create connection",
    wide: true,
    body(root) {
      if (recipes.length) {
        root.appendChild(helpParagraph("Suggested from your Items — or build a custom link."));
        const list = document.createElement("div");
        list.className = "choice-cards";
        recipes.forEach((recipe) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className =
            "choice-card" +
            (recipe.id === selectedRecipeId && mode === "suggested" ? " selected" : "");
          card.innerHTML = `<strong>${recipe.title}</strong><p class="muted">${recipe.kindLabel} — ${recipe.description}</p>`;
          card.addEventListener("click", () => {
            mode = "suggested";
            selectedRecipeId = recipe.id;
            list.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
            card.classList.add("selected");
            customBlock.hidden = true;
          });
          list.appendChild(card);
        });
        root.appendChild(list);
      }

      const customBtn = document.createElement("button");
      customBtn.type = "button";
      customBtn.className = "btn btn-sm";
      customBtn.textContent = recipes.length ? "Custom connection…" : "Choose Items";
      root.appendChild(customBtn);

      const customBlock = document.createElement("div");
      customBlock.hidden = Boolean(recipes.length);
      customBlock.appendChild(selectEntityRow("From", "conn-from", ids, schema, 0));
      customBlock.appendChild(
        selectEntityRow("To", "conn-to", ids, schema, Math.min(1, ids.length - 1))
      );

      const cards = document.createElement("div");
      cards.className = "choice-cards";
      ["containment", "junction", "assignment"].forEach((id) => {
        const help = STORAGE_HELP[id];
        const card = document.createElement("button");
        card.type = "button";
        card.className = "choice-card" + (id === storage ? " selected" : "");
        card.innerHTML = `<strong>${help.label}</strong><p>${help.summary}</p>`;
        card.addEventListener("click", () => {
          storage = id;
          cards.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
        });
        cards.appendChild(card);
      });
      customBlock.appendChild(cards);
      root.appendChild(customBlock);

      customBtn.addEventListener("click", () => {
        mode = "custom";
        customBlock.hidden = false;
      });
    },
    onConfirm(root) {
      if (mode === "suggested" && selectedRecipeId) {
        return { kind: "recipe", recipe: recipes.find((r) => r.id === selectedRecipeId) };
      }
      return {
        kind: "custom",
        from: root.querySelector("#conn-from").value,
        to: root.querySelector("#conn-to").value,
        storage,
        mirror: false,
      };
    },
  });

  if (!result) return null;
  schema.relationships = schema.relationships || [];
  let rel;
  if (result.kind === "recipe") {
    rel = result.recipe.build({ mirror: result.recipe.suggestMirror });
  } else {
    rel = buildCustomConnection({ ...result, schema });
  }
  if (schema.relationships.some((r) => r.id === rel.id)) {
    alert("That connection already exists.");
    return null;
  }
  schema.relationships.push(rel);
  return rel.id;
}

export function removeField(schema, entityId, fieldName) {
  const entity = schema.entity_types[entityId];
  if (!entity || isPrimaryKey(entity, fieldName)) return false;
  delete entity.fields[fieldName];
  (schema.views || []).forEach((v) => {
    if (v.columns_from_fields) {
      v.columns_from_fields = v.columns_from_fields.filter((c) => c !== fieldName);
    }
  });
  return true;
}

export function removeEntity(schema, entityId) {
  delete schema.entity_types[entityId];
  schema.relationships = (schema.relationships || []).filter(
    (r) => r.from !== entityId && r.to !== entityId
  );
  schema.views = (schema.views || []).filter((v) => v.entity !== entityId);
}

function selectEntityRow(label, id, entityIds, schema, defaultIndex = 0) {
  const row = document.createElement("label");
  row.className = "design-form-row";
  row.innerHTML = `<span>${label}</span>`;
  const sel = document.createElement("select");
  sel.id = id;
  entityIds.forEach((eid, i) => {
    const opt = document.createElement("option");
    opt.value = eid;
    opt.textContent = schema.entity_types[eid].label;
    opt.selected = i === defaultIndex;
    sel.appendChild(opt);
  });
  row.appendChild(sel);
  return row;
}

export { storageLabel, isPrimaryKey };
