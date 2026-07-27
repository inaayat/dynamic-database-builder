/** App-level workspace switcher — each workspace has its own schema + DB. */

import {
  activateWorkspace,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  startOverWorkspace,
} from "./schema-client.js?v=2";
import { FORMAT_OPTIONS } from "./design/brainstorm.js";
import { confirmModal, noticeModal } from "./design/modals.js";

const FORMAT_HINTS = {
  text: "Best for short labels, names, and titles.",
  longtext: "Best for notes, descriptions, and free writing.",
  date: "Best when most values are calendar dates.",
  datetime: "Best when values need a date and time.",
  enum: "Best when values come from a fixed set of choices.",
  number: "Best for counts, scores, and quantities.",
  currency: "Best for money amounts.",
  percent: "Best for rates and progress.",
  rating: "Best for star-style scores.",
  boolean: "Best for yes/no flags.",
  url: "Best for links and web addresses.",
  bullet_list: "Best for short lists inside a field.",
};

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

  let step = 1;

  const progress = document.createElement("div");
  progress.className = "app-workspace-create-progress";
  progress.setAttribute("aria-hidden", "true");

  const title = document.createElement("p");
  title.className = "app-workspace-create-title";

  const coach = document.createElement("p");
  coach.className = "app-workspace-create-coach";

  const nameLabel = document.createElement("label");
  nameLabel.className = "app-workspace-create-label";
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "app-workspace-create-input";
  nameInput.placeholder = "e.g. Teaching notes";
  nameInput.autocomplete = "off";
  nameLabel.append(nameInput);

  const formatLabel = document.createElement("label");
  formatLabel.className = "app-workspace-create-label";
  formatLabel.textContent = "Default field format";
  const formatSelect = document.createElement("select");
  formatSelect.className = "app-workspace-create-input app-workspace-create-select";
  FORMAT_OPTIONS.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.type;
    option.textContent = opt.label;
    if (opt.type === "longtext") option.selected = true;
    formatSelect.appendChild(option);
  });
  formatLabel.append(formatSelect);

  const formatHint = document.createElement("p");
  formatHint.className = "app-workspace-create-hint";

  const errorEl = document.createElement("p");
  errorEl.className = "app-workspace-create-error muted";
  errorEl.hidden = true;

  const actions = document.createElement("div");
  actions.className = "app-workspace-create-actions";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "btn btn-sm";
  backBtn.textContent = "Back";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-sm";
  cancelBtn.textContent = "Cancel";
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn btn-sm btn-primary";
  nextBtn.textContent = "Continue";
  actions.append(backBtn, cancelBtn, nextBtn);

  panel.append(progress, title, coach, nameLabel, formatLabel, formatHint, errorEl, actions);

  function updateFormatHint() {
    formatHint.textContent =
      FORMAT_HINTS[formatSelect.value] || "You can change individual fields later.";
  }

  function renderStep() {
    const onName = step === 1;
    title.textContent = onName ? "Name this workspace" : "Choose a default format";
    coach.textContent = onName
      ? "A workspace is a separate place with its own structure and data."
      : "New fields start with this format. You can override any field later.";
    nameLabel.hidden = !onName;
    formatLabel.hidden = onName;
    formatHint.hidden = onName;
    backBtn.hidden = onName;
    nextBtn.textContent = onName ? "Continue" : "Create & set up";
    progress.innerHTML = "";
    [1, 2].forEach((n) => {
      const dot = document.createElement("span");
      dot.className =
        "app-workspace-create-dot" +
        (n === step ? " active" : "") +
        (n < step ? " done" : "");
      progress.appendChild(dot);
    });
    if (!onName) updateFormatHint();
  }

  function show() {
    panel.hidden = false;
    step = 1;
    errorEl.hidden = true;
    errorEl.textContent = "";
    nameInput.value = "";
    formatSelect.value = "longtext";
    renderStep();
    setTimeout(() => nameInput.focus(), 0);
  }

  function hide() {
    panel.hidden = true;
    errorEl.hidden = true;
    errorEl.textContent = "";
    step = 1;
  }

  function setBusy(busy) {
    nextBtn.disabled = busy;
    backBtn.disabled = busy;
    cancelBtn.disabled = busy;
    nameInput.disabled = busy;
    formatSelect.disabled = busy;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  async function goNext() {
    if (step === 1) {
      const titleValue = nameInput.value.trim();
      if (!titleValue) {
        showError("Enter a workspace name.");
        nameInput.focus();
        return;
      }
      showError("");
      step = 2;
      renderStep();
      formatSelect.focus();
      return;
    }

    const titleValue = nameInput.value.trim();
    if (!titleValue) {
      step = 1;
      renderStep();
      showError("Enter a workspace name.");
      nameInput.focus();
      return;
    }

    setBusy(true);
    try {
      await onSubmit({ title: titleValue, formatType: formatSelect.value });
      hide();
    } catch (err) {
      showError(err.message || "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  }

  nextBtn.addEventListener("click", () => goNext());
  backBtn.addEventListener("click", () => {
    step = 1;
    showError("");
    renderStep();
    nameInput.focus();
  });
  cancelBtn.addEventListener("click", () => {
    hide();
    onCancel?.();
  });
  formatSelect.addEventListener("change", updateFormatHint);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goNext();
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
    onSubmit: async ({ title, formatType }) => {
      const data = await createWorkspace({ title, template: "blank", formatType });
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

  const brand = document.createElement("div");
  brand.className = "app-workspace-sidebar-brand";
  brand.innerHTML = `<span class="app-workspace-sidebar-brand-mark">◆</span><span>Databaser</span>`;

  const head = document.createElement("div");
  head.className = "app-workspace-sidebar-head";
  head.textContent = "Workspaces";

  const list = document.createElement("div");
  list.className = "app-workspace-sidebar-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Workspaces");

  const createForm = mountCreateForm({
    onSubmit: async ({ title, formatType }) => {
      const data = await createWorkspace({ title, template: "blank", formatType });
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

  const manageDetails = document.createElement("details");
  manageDetails.className = "app-workspace-sidebar-manage";
  const manageSummary = document.createElement("summary");
  manageSummary.textContent = "Manage";
  manageDetails.appendChild(manageSummary);

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

  manageDetails.append(startOverBtn, deleteBtn);
  actions.append(newBtn, manageDetails);
  mount.append(brand, head, list, createForm.panel, actions);

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
      meta.className =
        "app-workspace-sidebar-item-meta" + (ws.empty ? " is-setup" : " is-ready");
      meta.textContent = ws.empty ? "Needs setup" : "Ready";

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
  return ws.title + (ws.empty ? " (needs setup)" : "");
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
    await noticeModal({
      title: "Could not switch",
      message: err.message || "Could not switch workspace.",
    });
    onError?.();
  }
}

async function startOverActive(state, onChange, trigger) {
  const active = state.workspaces.find((w) => w.id === state.active_id);
  const name = active?.title || "this workspace";
  const ok = await confirmModal({
    title: "Start over?",
    message: `Clear “${name}”? This removes the Setup model and deletes all records. This cannot be undone.`,
    confirmLabel: "Start over",
    danger: true,
  });
  if (!ok) return;
  trigger.disabled = true;
  try {
    const data = await startOverWorkspace(state.active_id);
    onChange?.(data, { startOver: true });
  } catch (err) {
    await noticeModal({
      title: "Could not start over",
      message: err.message || "Could not start over.",
    });
  } finally {
    trigger.disabled = false;
  }
}

async function deleteActive(state, onChange, trigger, afterDelete) {
  if (state.workspaces.length <= 1) {
    await noticeModal({
      title: "Keep one workspace",
      message: "You need at least one workspace.",
    });
    return;
  }
  const active = state.workspaces.find((w) => w.id === state.active_id);
  const name = active?.title || "this workspace";
  const ok = await confirmModal({
    title: "Delete workspace?",
    message: `Delete “${name}”? This removes the workspace, its Setup model, and all data. This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  trigger.disabled = true;
  try {
    const data = await deleteWorkspace(state.active_id);
    state.active_id = data.active_id;
    await afterDelete?.();
    onChange?.(data, { deleted: true });
  } catch (err) {
    await noticeModal({
      title: "Could not delete",
      message: err.message || "Could not delete workspace.",
    });
  } finally {
    trigger.disabled = false;
  }
}
