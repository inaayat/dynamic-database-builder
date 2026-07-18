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

function mountCreateForm({ onSubmit, onCancel }) {
  const panel = document.createElement("div");
  panel.className = "app-workspace-create";
  panel.hidden = true;

  const title = document.createElement("p");
  title.className = "app-workspace-create-title";
  title.textContent = "New workspace";

  const nameLabel = document.createElement("label");
  nameLabel.className = "app-workspace-create-label";
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "app-workspace-create-input";
  nameInput.placeholder = "e.g. AMC A-List Tracking";
  nameInput.autocomplete = "off";
  nameLabel.append(nameInput);

  const templateLabel = document.createElement("span");
  templateLabel.className = "app-workspace-create-label";
  templateLabel.textContent = "Start from";

  const templateField = document.createElement("div");
  templateField.className = "app-workspace-create-templates";
  templateField.setAttribute("role", "radiogroup");
  templateField.setAttribute("aria-label", "Workspace template");

  const templates = [
    { id: "blank", label: "Blank workspace", hint: "Brainstorm from scratch" },
    { id: "tagged_knowledge_base", label: "Notes template", hint: "Pre-built notes KB" },
  ];

  templates.forEach((tpl, i) => {
    const opt = document.createElement("label");
    opt.className = "app-workspace-create-template";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "workspace-template";
    radio.value = tpl.id;
    radio.checked = i === 0;
    const copy = document.createElement("span");
    copy.className = "app-workspace-create-template-copy";
    const strong = document.createElement("strong");
    strong.textContent = tpl.label;
    const hint = document.createElement("small");
    hint.className = "muted";
    hint.textContent = tpl.hint;
    copy.append(strong, hint);
    opt.append(radio, copy);
    templateField.appendChild(opt);
  });

  const errorEl = document.createElement("p");
  errorEl.className = "app-workspace-create-error muted";
  errorEl.hidden = true;

  const actions = document.createElement("div");
  actions.className = "app-workspace-create-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-sm";
  cancelBtn.textContent = "Cancel";
  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.className = "btn btn-sm btn-primary";
  createBtn.textContent = "Create";
  actions.append(cancelBtn, createBtn);

  panel.append(title, nameLabel, templateLabel, templateField, errorEl, actions);

  function selectedTemplate() {
    const checked = templateField.querySelector('input[name="workspace-template"]:checked');
    return checked?.value || "blank";
  }

  function show() {
    panel.hidden = false;
    errorEl.hidden = true;
    errorEl.textContent = "";
    nameInput.value = "";
    const firstRadio = templateField.querySelector('input[value="blank"]');
    if (firstRadio) firstRadio.checked = true;
    setTimeout(() => nameInput.focus(), 0);
  }

  function hide() {
    panel.hidden = true;
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  function setBusy(busy) {
    createBtn.disabled = busy;
    cancelBtn.disabled = busy;
    nameInput.disabled = busy;
    templateField.querySelectorAll("input").forEach((el) => {
      el.disabled = busy;
    });
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  async function submit() {
    const title = nameInput.value.trim();
    if (!title) {
      showError("Enter a workspace name.");
      nameInput.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ title, template: selectedTemplate() });
      hide();
    } catch (err) {
      showError(err.message || "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  }

  createBtn.addEventListener("click", () => submit());
  cancelBtn.addEventListener("click", () => {
    hide();
    onCancel?.();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      onCancel?.();
    }
  });

  return { panel, show, hide, isOpen: () => !panel.hidden };
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

  const row = document.createElement("div");
  row.className = "app-workspace-bar-row";
  row.append(label, select, newBtn, startOverBtn);

  const createForm = mountCreateForm({
    onSubmit: async ({ title, template }) => {
      const data = await createWorkspace({ title, template });
      state.active_id = data.workspace?.id || data.active_id;
      await refresh(state, renderSelect);
      onChange?.(data, { created: true });
    },
  });

  mount.append(row, createForm.panel);

  select.addEventListener("change", async () => {
    const id = select.value;
    if (!id || id === state.active_id) return;
    await switchWorkspace(id, state, onChange, () => {
      select.value = state.active_id || "";
    });
  });

  newBtn.addEventListener("click", () => {
    if (createForm.isOpen()) {
      createForm.hide();
      return;
    }
    createForm.show();
  });

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

  const createForm = mountCreateForm({
    onSubmit: async ({ title, template }) => {
      const data = await createWorkspace({ title, template });
      state.active_id = data.workspace?.id || data.active_id;
      await refresh(state, renderList);
      onChange?.(data, { created: true });
    },
  });

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
  mount.append(head, list, createForm.panel, actions);

  newBtn.addEventListener("click", () => {
    if (createForm.isOpen()) {
      createForm.hide();
      return;
    }
    createForm.show();
  });

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
