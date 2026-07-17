/** Shared modal helpers for Design tab. */

export function openModal({ title, body, onConfirm, confirmLabel = "Add", wide = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal" + (wide ? " modal-wide" : "");

    const h = document.createElement("h3");
    h.textContent = title;
    modal.appendChild(h);

    const content = document.createElement("div");
    content.className = "modal-body";
    if (typeof body === "function") body(content);
    else if (body instanceof Node) content.appendChild(body);
    else content.innerHTML = body;
    modal.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-primary";
    ok.textContent = confirmLabel;

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    ok.addEventListener("click", () => {
      const value = onConfirm ? onConfirm(content) : true;
      if (value === false) return;
      close(value);
    });

    actions.append(cancel, ok);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

export function slugify(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/s$/, "") || "item";
}
