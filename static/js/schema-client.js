/** API client for schema Design tab. */

export async function getSchema() {
  const res = await fetch("/api/schema");
  if (!res.ok) throw new Error(`GET /api/schema: HTTP ${res.status}`);
  return res.json();
}

export async function getPackages() {
  const res = await fetch("/api/schema/packages");
  if (!res.ok) throw new Error(`GET /api/schema/packages: HTTP ${res.status}`);
  return res.json();
}

export async function patchSchema(partial) {
  const res = await fetch("/api/schema", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `PATCH /api/schema: HTTP ${res.status}`);
  }
  return res.json();
}

export async function validateSchema(schema) {
  const res = await fetch("/api/schema/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema || {}),
  });
  if (!res.ok) throw new Error(`POST /api/schema/validate: HTTP ${res.status}`);
  return res.json();
}

export async function applySchema(schema) {
  const res = await fetch("/api/schema/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = formatApiDetail(data.detail || data.message || data);
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function formatApiDetail(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
          const msg = item.msg || item.message || JSON.stringify(item);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(item);
      })
      .join("; ");
  }
  if (typeof detail === "object") {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  return String(detail);
}

export async function loadPackage(id) {
  const res = await fetch(`/api/schema/package/${encodeURIComponent(id)}`, {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export async function listWorkspaces() {
  const res = await fetch("/api/workspaces");
  if (!res.ok) throw new Error(`GET /api/workspaces: HTTP ${res.status}`);
  return res.json();
}

export async function createWorkspace({ title, template = "blank" }) {
  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, template }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatApiDetail(data.detail || data.message) || `HTTP ${res.status}`);
  return data;
}

export async function activateWorkspace(workspaceId) {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/activate`, {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatApiDetail(data.detail || data.message) || `HTTP ${res.status}`);
  return data;
}

export async function startOverWorkspace(workspaceId) {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/start-over`,
    { method: "POST" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatApiDetail(data.detail || data.message) || `HTTP ${res.status}`);
  return data;
}
