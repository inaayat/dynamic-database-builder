# Archived design studio & map

This folder holds the former **Design studio** and **ERD/map** UI, removed from the active app in favor of the brainstorm flow and Workspace → Customize.

## Contents

| Path | Description |
|------|-------------|
| `js/item-editor.js` | Inline item-type editor (studio left panel) |
| `js/field-suggest.js` | Name matching for item editor link fields |
| `js/workspace-map.js` | ERD canvas with draggable tables and relationship lines |
| `js/map-layout.js` | Layout persistence for the map |
| `js/studio-workspace-panel.js` | Full workspace-tabs panel (sidebar + inline variants) |
| `js/entity-panel.js` | Legacy entity list panel |
| `js/inspector.js` | Legacy field inspector |
| `js/connection-panel.js` | Legacy connection editor |
| `js/setup-wizard.js` | Multi-step setup wizard |
| `design_brainstorm_ui_inferred_links.plan.md` | Planning notes for brainstorm UI |

## Active replacements

- **New workspaces** → brainstorm flow (`static/js/design/brainstorm-flow.js`)
- **Workspace tabs step** → `static/js/design/workspace-tabs-panel.js` (inline only)
- **Post-apply tweaks** → Workspace → Customize (`static/js/views/customize-panel.js`)

These archived modules are not imported by the running app. They are kept for reference or future revival.
