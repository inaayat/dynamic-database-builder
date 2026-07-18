/** App-level workspace switcher — each workspace has its own schema + SQLite DB. */

import {
  activateWorkspace,
  createWorkspace,
  listWorkspaces,
  startOverWorkspace,
} from "./schema-client.js?v=2";

export function mountAppWorkspaceBar({ mount, onChange }) {
  let state = { active_id: null, workspaces: [] };

  mount.className = "app-workspace-bar";
  mount.innerHTML = "";

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
    select.disabled = true;
    try {
      const data = await activateWorkspace(id);
      state.active_id = data.active_id;
      onChange?.(data);
    } catch (err) {
      alert(err.message || "Could not switch workspace.");
      select.value = state.active_id || "";
    } finally {
      select.disabled = false;
    }
  });

  newBtn.addEventListener("click", () => openCreateDialog());

  startOverBtn.addEventListener("click", async () => {
    const active = state.workspaces.find((w) => w.id === state.active_id);
    const name = active?.title || "this workspace";
    if (
      !confirm(
        `Start over “${name}”?\n\nThis clears the Design schema and deletes all data in this workspace’s database. This cannot be undone.`
      )
    ) {
      return;
    }
    startOverBtn.disabled = true;
    try {
      const data = await startOverWorkspace(state.active_id);
      onChange?.(data, { startOver: true });
    } catch (err) {
      alert(err.message || "Could not start over.");
    } finally {
      startOverBtn.disabled = false;
    }
  });

  async function openCreateDialog() {
    const title = prompt("Name for the new workspace:");
    if (!title?.trim()) return;

    const template = confirm(
      "Use the Notes template?\n\nOK = Notes template\nCancel = blank workspace"
    )
      ? "tagged_knowledge_base"
      : "blank";

    newBtn.disabled = true;
    try {
      const data = await createWorkspace({ title: title.trim(), template });
      state.active_id = data.workspace?.id || data.active_id;
      await refresh();
      onChange?.(data, { created: true });
    } catch (err) {
      alert(err.message || "Could not create workspace.");
    } finally {
      newBtn.disabled = false;
    }
  }

  function renderSelect() {
    select.innerHTML = "";
    state.workspaces.forEach((ws) => {
      const opt = document.createElement("option");
      opt.value = ws.id;
      opt.textContent = ws.title + (ws.empty ? " (empty)" : "");
      opt.selected = ws.id === state.active_id;
      select.appendChild(opt);
    });
  }

  async function refresh() {
    const data = await listWorkspaces();
    state = data;
    renderSelect();
    return state;
  }

  refresh();

  return {
    refresh,
    getActiveId: () => state.active_id,
  };
}
