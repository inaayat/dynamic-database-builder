# Continuation Prompt: Dynamic Database Builder

Copy everything below the line into a new chat session to resume this work.

**Also read:**
- `GENERALIZED_SUMMARY.md` — conceptual model (elements, storage types, actions)
- `BUILD_PLAN.md` — phased implementation plan (notes KB → Design tab → mind map)
- `TECHNICAL_SPEC.md` — field→SQLite mapping, projection/junction algorithms, worked package

---

```
I'm continuing work on the dynamic-database-builder project — a schema-driven,
local-first knowledge/planning site toolkit. Do NOT assume you need GitHub unless I say so.

## Project (this repo)

Path: ~/Projects/dynamic-database-builder

Stack (target):
- SQLite working DB: planning.db (gitignored, live source of truth)
- FastAPI + editor.html local editor (python run.py, port 8770)
- Published JSON in data/*.json (optional — git/Pages path)
- Read-only public dashboard: index.html (optional)
- GitHub Issue forms + sync.py (optional contributor path)

Architecture:
  planning.db ↔ editor.html/FastAPI (live editing)
  planning.db → export → data/*.json → (optional) git push → GitHub Pages
  GitHub Issues → sync.py → data/*.json (optional)

Key files (target layout):
- run.py, kit/api/app.py, static/editor.html, static/index.html, static/styles.css
- kit/engine/db.py, kit/schema/model.py, kit/engine/relationships.py
- kit/engine/export/json_export.py, kit/engine/export/xlsx_export.py
- scripts/: new_site.py, export_site.py

## Planning docs (this repo)

- GENERALIZED_SUMMARY.md — generalized primitives, buttons, FE/BE split, Connection Builder UI design
- TECHNICAL_SPEC.md — SQLite mapping, projection sync, junction diff algorithms
- BUILD_PLAN.md — phased implementation plan
- site.schema.json — machine-readable entity/relationship schema
- examples/tagged_knowledge_base.json — minimal worked package
- examples/mind-map.schema.json
- KNOWLEDGE_SITE_TEMPLATE.md
- CONTINUATION_PROMPT.md — this file

## Generalized primitives (use these names when templating)

### Elements (entity types)
- container → checklists
- primary_row → items
- catalog_entry → resources, pocs, themes
- thread → questions (catalog-first, M:N to items/resources)
- hierarchy → rcm_risks / rcm_controls

### Field types
text | longtext | bullet_list (\x1e sep) | json_array | multiline_text | enum | date | number | boolean | foreign_key

Formatting-sensitive: bullet_list separator, projection line_format ("Title — URL (meta)"), structured aspect ("A — B — C" for support questionnaires)

### Storage types (relationships)
A. containment (FK)     — checklist→item, risk→control
B. junction (M:N)       — resource↔item, poc↔item, theme↔*, question↔*
C. projection           — junction PLUS mirror to items.resources / items.poc (sync on tag + row save)
D. assignment (FK)      — question→poc, resource→owner_poc_id
E. embedded             — sub_items JSON, notes bullets on row
F. derived (no FK)      — item "+ Add risk" → rcm_risk
G. provenance           — github_issue → JSON

### Action primitives (buttons)
autosave_row (600ms debounce) | create_catalog | edit_catalog_row | open_tag_modal (+ Tag)
| pick_from_catalog (Tag catalog) | open_theme_modal | create_derived | link_existing
| export_json (POST /api/export → data/) | export_xlsx (GET /api/export/xlsx → browser download)
| export_publish (git)

Shared UI: tag modal reused for resource tags, POC tags, canonical item link (modes).

### Front-end vs back-end
- FE: editor renders views, collects rowPayload(), scheduleSave(), modals, box stacks for resources/POC
- BE: API validates (Pydantic), engine owns junction diff, projection parse/format, export
- Public index.html: fetch JSON only, no API

### Export profiles
- sqlite_backup: full fidelity (copy planning.db)
- json_export: publish subset → data/*.json (add zip download in Phase 1)
- xlsx_export: rich snapshot — all checklist sheets, Resources, POCs, Questions, Themes, RCM; browser download

JSON excludes: questions, rcm. XLSX includes both.

Item fields in compliance pattern: coverage_status, canonical_checklist_id, canonical_item_id
Resource fields: owner_poc_id, starred
Questions: catalog entity with question_items, question_resources, question_themes junctions

## Connection Builder UI (target architecture)

Goal: visual editor that writes site.schema.json — no hand-syncing db.py + app.py + editor.html.

Screens: entity list | connection canvas (nodes + edges) | edge inspector (storage, projection, UI widget, export flags)
Emits: entity_types, relationships, views, actions, export_profiles, deployment.mode
Runtime: generic FastAPI + schema-driven editor OR codegen into new site folder

See GENERALIZED_SUMMARY.md §11 for full design sketch.

## Local-only deployment

python run.py only — no git, no Pages, no sync.py
Export JSON + XLSX for backup/sharing
deployment.mode: local_only | github_pages | both

## Template packages (site.schema.json)

1. outline_notes
2. tagged_knowledge_base
3. owned_project_tracker
4. audit_compliance
5. mind_map_canvas

## Proposed next steps

1. Add deployment + export_profiles to site.schema.json
2. Build Connection Builder UI (schema editor) OR generic schema runtime
3. GET /api/export/json.zip for browser JSON backup
4. scripts/new_site.py scaffolder from schema
5. Generic editor.html that reads GET /api/schema

## Constraints

- Prefer minimal diffs; match Python/FastAPI conventions in BUILD_PLAN.md and TECHNICAL_SPEC.md
- Only commit when I ask

## My goal for this session

[Describe what you want]
```

---

## Quick reference — folder contents

```
~/Projects/dynamic-database-builder/
├── CONTINUATION_PROMPT.md      ← this file
├── GENERALIZED_SUMMARY.md      ← generalized model + Connection Builder design
├── TECHNICAL_SPEC.md           ← SQLite mapping, projection/junction spec
├── BUILD_PLAN.md               ← phased build plan (5 phases, mind map in Phase 3)
├── KNOWLEDGE_SITE_TEMPLATE.md
├── site.schema.json
└── examples/
    ├── tagged_knowledge_base.json
    └── mind-map.schema.json
```
