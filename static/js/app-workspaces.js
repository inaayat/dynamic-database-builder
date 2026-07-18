/** App-level workspace switcher — each workspace has its own schema + SQLite DB. */

import {
  activateWorkspace,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  startOverWorkspace,
} from "./schema-client.js?v=2";

export function mountAppWorkspaceBar({ mount, onChange, variant = "sidebar" }) {
  if (variant === "sidebar") {
    mount.className = "app-workspace-sidebar";
    return mountSidebar({ mount, onChange });
  }
  mount.className = "app-workspace-bar";
  return mountBar({ mount, onChange });
}

function mountBar({ mount, onChange }) {
  let state = { active_id: null, workspaces: [] };

  const label = document.createElement("span");
  label.className = "app-workspace-label";
  label.textContent = "Workspace";

  const select = document.createElement("select");
  select.className = "app-workspace-select";
  select.title = "Switch workspace";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "btn btn-sm";
  newBtn.textContent = "+ New";
  newBtn.title = "Create a new workspace";

  const startOverBtn = document.createElement("button");
  startOverBtn.type = "button";
  startOverBtn.className = "btn btn-sm app-workspace-start-over";
  startOverBtn.textContent = "Start over";
  startOverBtn.title = "Clear this workspace design and data";

  mount.append(label, select, newBtn, startOverBtn);

  select.addEventListener("change", async () => {
    const id = select.value;
    if (!id || id === state.active_id) return;
    await switchWorkspace(id, state, onChange, () => {
      select.value = state.active_id || "";
    });
  });

  newBtn.addEventListener("click", () =>
    openCreateDialog(state, onChange, newBtn, async () => {
      await refresh(state, renderSelect);
    })
  );

  startOverBtn.addEventListener("click", () =>
    startOverActive(state, onChange, startOverBtn)
  );

  function renderSelect() {
    select.innerHTML = "";
    state.workspaces.forEach((ws) => {
      const opt = document.createElement("option");
      opt.value = ws.id;
      opt.textContent = workspaceLabel(ws);
      opt.selected = ws.id === state.active_id;
      select.appendChild(opt);
    });
  }

  refresh(state, renderSelect);

  return {
    refresh: () => refresh(state, renderSelect),
    getActiveId: () => state.active_id,
  };
}

function mountSidebar({ mount, onChange }) {
  let state = { active_id: null, workspaces: [] };

  const head = document.createElement("div");
  head.className = "app-workspace-sidebar-head";
  head.textContent = "Workspaces";

  const list = document.createElement("div");
  list.className = "app-workspace-sidebar-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Workspaces");

  const actions = document.createElement("div");
  actions.className = "app-workspace-sidebar-actions";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "btn btn-sm app-workspace-sidebar-new";
  newBtn.textContent = "+ New workspace";
  newBtn.title = "Create a new workspace";

  const startOverBtn = document.createElement("button");
  startOverBtn.type = "button";
  startOverBtn.className = "btn btn-sm app-workspace-start-over";
  startOverBtn.textContent = "Start over";
  startOverBtn.title = "Clear this workspace design and data";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-sm app-workspace-delete";
  deleteBtn.textContent = "Delete workspace";
  deleteBtn.title = "Remove this workspace and its database";

  actions.append(newBtn, startOverBtn, deleteBtn);
  mount.append(head, list, actions);

  newBtn.addEventListener("click", () =>
    openCreateDialog(state, onChange, newBtn, async () => {
      await refresh(state, renderList);
    })
  );

  startOverBtn.addEventListener("click", () =>
    startOverActive(state, onChange, startOverBtn)
  );

  deleteBtn.addEventListener("click", () =>
    deleteActive(state, onChange, deleteBtn, async () => {
      await refresh(state, renderList);
    })
  );

  function renderList() {
    list.innerHTML = "";
    const canDelete = state.workspaces.length > 1;
    deleteBtn.disabled = !canDelete;
    deleteBtn.title = canDelete
      ? "Remove this workspace and its database"
      : "You need at least one workspace";
    state.workspaces.forEach((ws) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "app-workspace-sidebar-item" + (ws.id === state.active_id ? " active" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", ws.id === state.active_id ? "true" : "false");
      btn.dataset.workspaceId = ws.id;

      const title = document.createElement("span");
      title.className = "app-workspace-sidebar-item-title";
      title.textContent = ws.title;

      const meta = document.createElement("span");
      meta.className = "app-workspace-sidebar-item-meta muted";
      meta.textContent = ws.empty ? "empty" : "";
      meta.hidden = !ws.empty;

      btn.append(title, meta);
      btn.addEventListener("click", async () => {
        if (ws.id === state.active_id) return;
        btn.disabled = true;
        try {
          await switchWorkspace(ws.id, state, onChange);
          renderList();
        } finally {
          btn.disabled = false;
        }
      });
      list.appendChild(btn);
    });
  }

  refresh(state, renderList);

  return {
    refresh: () => refresh(state, renderList),
    getActiveId: () => state.active_id,
  };
}

function workspaceLabel(ws) {
  return ws.title + (ws.empty ? " (empty)" : "");
}

async function refresh(state, render) {
  const data = await listWorkspaces();
  Object.assign(state, data);
  render();
  return state;
}

async function switchWorkspace(id, state, onChange, onError) {
  try {
    const data = await activateWorkspace(id);
    state.active_id = data.active_id;
    onChange?.(data);
  } catch (err) {
    alert(err.message || "Could not switch workspace.");
    onError?.();
  }
}

async function openCreateDialog(state, onChange, trigger, afterCreate) {
  const title = prompt("Name for the new workspace:");
  if (!title?.trim()) return;

  const template = confirm(
    "Use the Notes template?\n\nOK = Notes template\nCancel = blank workspace"
  )
    ? "tagged_knowledge_base"
    : "blank";

  trigger.disabled = true;
  try {
    const data = await createWorkspace({ title: title.trim(), template });
    state.active_id = data.workspace?.id || data.active_id;
    await afterCreate?.();
    onChange?.(data, { created: true });
  } catch (err) {
    alert(err.message || "Could not create workspace.");
  } finally {
    trigger.disabled = false;
  }
}

async function startOverActive(state, onChange, trigger) {
  const active = state.workspaces.find((w) => w.id === state.active_id);
  const name = active?.title || "this workspace";
  if (
    !confirm(
      `Start over “${name}”?\n\nThis clears the Design schema and deletes all data in this workspace’s database. This cannot be undone.`
    )
  ) {
    return;
  }
  trigger.disabled = true;
  try {
    const data = await startOverWorkspace(state.active_id);
    onChange?.(data, { startOver: true });
  } catch (err) {
    alert(err.message || "Could not start over.");
  } finally {
    trigger.disabled = false;
  }
}

async function deleteActive(state, onChange, trigger, afterDelete) {
  if (state.workspaces.length <= 1) {
    alert("You need at least one workspace.");
    return;
  }
  const active = state.workspaces.find((w) => w.id === state.active_id);
  const name = active?.title || "this workspace";
  if (
    !confirm(
      `Delete “${name}”?\n\nThis removes the workspace, its Design schema, and all data. This cannot be undone.`
    )
  ) {
    return;
  }
  trigger.disabled = true;
  try {
    const data = await deleteWorkspace(state.active_id);
    state.active_id = data.active_id;
    await afterDelete?.();
    onChange?.(data, { deleted: true });
  } catch (err) {
    alert(err.message || "Could not delete workspace.");
  } finally {
    trigger.disabled = false;
  }
}
