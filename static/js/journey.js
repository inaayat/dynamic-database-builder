/** Workspace journey helpers — Setup → Browse. */

export function isSchemaEmpty(schema) {
  return !Object.keys(schema?.entity_types || {}).length;
}

export function workspacePhase(schema) {
  if (!schema || isSchemaEmpty(schema)) return "setup";
  return "ready";
}

export function phaseCopy(phase) {
  if (phase === "setup") {
    return {
      id: "setup",
      label: "Needs setup",
      hint: "Name what you track, then open Browse to add records.",
      mode: "design",
    };
  }
  return {
    id: "ready",
    label: "Ready",
    hint: "Browse and edit records. Customize tabs anytime.",
    mode: "edit",
  };
}

export function preferredModeForSchema(schema, { forceSetup = false } = {}) {
  if (forceSetup || isSchemaEmpty(schema)) return "design";
  return "edit";
}
