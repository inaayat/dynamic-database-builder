/** Debounced row PATCH with save status. */
export function createAutosave({ debounceMs = 600, onSave }) {
  let timer = null;
  let lastPayload = null;

  function scheduleSave(payload, statusEl) {
    const json = JSON.stringify(payload);
    if (json === lastPayload) return;
    if (statusEl) statusEl.textContent = "Pending…";
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (statusEl) statusEl.textContent = "Saving…";
      try {
        await onSave(payload);
        lastPayload = json;
        if (statusEl) statusEl.textContent = "Saved";
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error: " + e.message;
      }
    }, debounceMs);
  }

  function saveNow(payload, statusEl) {
    clearTimeout(timer);
    scheduleSave(payload, statusEl);
  }

  return { scheduleSave, saveNow };
}
