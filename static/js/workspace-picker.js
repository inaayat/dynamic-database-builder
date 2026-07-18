/** Workspace (container) picker — list, switch, and create scoped workspaces. */

import { defaultNewRow, entityListUrl } from "./entity-api.js";

const STORAGE_PREFIX = "ddb.workspace.";

export function getContainerEntityId(schema) {
  const fromView = schema.views?.find((v) => v.container_entity)?.container_entity;
  if (fromView) return fromView;
  return (
    Object.entries(schema.entity_types || {}).find(([, e]) => e.primitive === "container")?.[0] ||
    null
  );
}

export function loadStoredWorkspaceId(siteId) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${siteId}`) || null;
  } catch {
    return null;
  }
}

export function storeWorkspaceId(siteId, workspaceId) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${siteId}`, workspaceId);
  } catch {
    /* ignore */
  }
}

export async function mountWorkspacePicker({ mount, schema, getActiveId, onSelect }) {
  const containerEntityId = getContainerEntityId(schema);
  if (!containerEntityId) {
    mount.hidden = true;
    return { refresh: async () => [], hide: true };
  }

  const entity = schema.entity_types[containerEntityId];
  const label = entity?.label || "Workspace";

  mount.hidden = false;
  mount.className = "workspace-picker";

  async function fetchWorkspaces() {
    const res = await fetch(entityListUrl(containerEntityId));
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  function workspaceTitle(row) {
    return row.title || row.name || row.label || row.id;
  }

  function renderSelect(rows) {
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "workspace-picker-inner";

    const nameLabel = document.createElement("span");
    nameLabel.className = "workspace-picker-heading";
    nameLabel.textContent = label;

    const sel = document.createElement("select");
    sel.className = "ie-input workspace-picker-select";
    sel.title = `Switch ${label}`;

    const activeId = getActiveId();
    let hasActive = false;

    rows.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = String(row.id);
      opt.textContent = workspaceTitle(row);
      if (String(row.id) === String(activeId)) {
        opt.selected = true;
        hasActive = true;
      }
      sel.appendChild(opt);
    });

    if (!hasActive && rows.length) {
      sel.value = String(rows[0].id);
      onSelect(String(rows[0].id));
    }

    sel.addEventListener("change", () => onSelect(sel.value));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-sm workspace-picker-add";
    addBtn.textContent = "+ New";
    addBtn.title = `Create a new ${label}`;
    addBtn.addEventListener("click", async () => {
      const title = prompt(`Name for new ${label}:`);
      if (!title?.trim()) return;
      addBtn.disabled = true;
      try {
        const body = defaultNewRow(schema, containerEntityId);
        body.title = title.trim();
        const res = await fetch(entityListUrl(containerEntityId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        await refresh();
        onSelect(String(created.id));
      } catch (err) {
        alert(err.message || "Could not create workspace.");
      } finally {
        addBtn.disabled = false;
      }
    });

    wrap.append(nameLabel, sel, addBtn);
    mount.appendChild(wrap);
  }

  async function refresh() {
    const rows = await fetchWorkspaces();
    renderSelect(rows);
    return rows;
  }

  await refresh();
  return { refresh };
}
