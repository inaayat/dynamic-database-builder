# Generalized Knowledge Site Pattern — Summary

A portable mental model for building similar local-first apps (note-taking, mind maps, audits, trackers) with the same buttons, storage types, relationships, and export paths — plus a path toward a **visual connection builder** instead of hand-coded back-and-forth.

---

## 1. The pattern in one sentence

**Live SQLite + schema-driven REST API + single-page editor + optional JSON/XLSX export** — where relationships are declared as primitives, not invented per project.

---

## 2. Layer map (generalized names)

| Layer | Reference impl | Generalized role |
|-------|----------------|------------------|
| **Working DB** | `planning.db` | `app.db` — gitignored, full fidelity |
| **API** | `app.py` (FastAPI) | Generic CRUD + relationship endpoints from schema |
| **Editor** | `edit.html` | View runtime driven by `views[]` in schema |
| **Public site** | `index.html` | Optional read-only view over published JSON |
| **Published data** | `data/*.json` | Subset export for git/Pages/portability |
| **Schema** | (hand-coded today) | `site.schema.json` — single source of truth |

```
┌─────────────┐     REST      ┌──────────────┐     SQL      ┌──────────┐
│  Editor UI  │ ◄──────────► │   API layer  │ ◄──────────► │ SQLite   │
│  (views)    │               │  (generated) │              │ (live)   │
└─────────────┘               └──────┬───────┘              └──────────┘
                                     │
                              export profiles
                                     ▼
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
              data/*.json                        *.xlsx download
           (publish subset)                    (full snapshot)
```

---

## 3. Elements (entity types)

Reusable **nouns**. Enable/disable per site via schema modules.

| Primitive ID | Purpose | Example labels |
|--------------|---------|------------------|
| `container` | Holds primary rows | Checklist, Canvas, Notebook |
| `primary_row` | Main editable unit | Item, Node, Note, Task |
| `catalog_entry` | Shared reusable record | Resource, POC, Tag, Reference |
| `thread` | Standalone Q&A / discussion | Question |
| `hierarchy_parent` | Parent in tree/matrix | Risk, Category |
| `hierarchy_child` | Child under parent | Control, Sub-task |
| `external_intake` | Provenance only | GitHub Issue, Form submission |

**Reference pattern mapping:**

| Primitive | Tables |
|-----------|--------|
| container | `checklists` |
| primary_row | `items` |
| catalog_entry | `resources`, `pocs`, `themes` |
| thread | `questions` |
| hierarchy_parent/child | `rcm_risks`, `rcm_controls` |

---

## 4. Field types (reusable)

Declare on any entity in schema. Codegen creates DB column + API validation + editor widget.

| Field type | SQL storage | Value type | Editor widget | Export notes |
|------------|-------------|------------|---------------|--------------|
| `text` | TEXT | string | `<input>` / short textarea | As-is |
| `longtext` | TEXT | string | textarea | As-is |
| `bullet_list` | TEXT | string[] serialized | multi input rows | Join with `\x1e` or newlines |
| `json_array` | TEXT | JSON array | nested list UI | `json.dumps` |
| `multiline_text` | TEXT | string (lines) | line boxes or textarea | Often **projection target** |
| `enum` | TEXT | string from options | `<select>` | Validate against options |
| `date` | TEXT | ISO `YYYY-MM-DD` | date input | |
| `datetime` | TEXT | ISO 8601 | datetime input | |
| `number` | REAL / INTEGER | float / int | number input | |
| `boolean` | INTEGER 0/1 | bool | checkbox | |
| `foreign_key` | TEXT/INT | id | dropdown / picker | Resolved in export optionally |

**Formatting-sensitive fields** (parsing matters):

- `bullet_list` → separator `\x1e` between bullets
- `multiline_text` with `line_format` → catalog projection lines (`Title — URL (meta)`)
- Structured `text` with `segment_sep` → e.g. `Questionnaire — Section — Question` for grouping

---

## 5. Storage types (how connections persist)

Six patterns — every relationship in the compliance audit reference pattern maps to one of these:

| ID | Name | When to use | DB shape |
|----|------|-------------|----------|
| `containment` | Parent owns children | 1:N hierarchy | FK on child |
| `junction` | Many-to-many | Tagging, linking | Junction table composite PK |
| `projection` | Display mirror | Public JSON needs simple strings | Junction + formatted text on primary row |
| `assignment` | Optional owner | Single FK on child | `child.parent_id → catalog` |
| `embedded` | Same-row structure | Bullets, sub-items | Column on primary row |
| `derived` | Action creates record | No back-link needed | No FK; copy fields on create |
| `provenance` | External write | Issue forms, imports | Id on record, no graph FK |

**Projection** is the subtle one: Resource↔Item uses `resource_tags` **and** mirrors to `items.resources`. The connection builder must let you opt into projection + define `line_format`.

---

## 6. Relationships (edges)

A relationship is a **directed edge** with metadata:

```json
{
  "id": "catalog_tags_primary",
  "from": { "entity": "resource", "cardinality": "many" },
  "to": { "entity": "item", "cardinality": "many" },
  "storage": "junction",
  "junction_table": "resource_tags",
  "keys": ["resource_id", "container_id", "row_id"],
  "projection": {
    "target_field": "items.resources",
    "line_format": "{title} — {link} ({type} · {submitted_by})",
    "sync_on": ["tag_save", "row_save"]
  },
  "ui": {
    "catalog_action": "+ Tag",
    "row_action": "Tag catalog",
    "widget": "tag_modal"
  },
  "export": { "json": true, "xlsx": "via_projection" }
}
```

### Reference relationship inventory (compliance audit pattern)

| Edge | Storage | Projection? |
|------|---------|---------------|
| checklist → item | containment | — |
| resource ↔ item | junction | yes → `items.resources` |
| poc ↔ item | junction | yes → `items.poc` |
| theme ↔ item | junction | no |
| theme ↔ resource | junction | no |
| theme ↔ question | junction | no |
| question ↔ item | junction | no |
| question ↔ resource | junction | no |
| question → poc | assignment | — |
| resource → poc (owner) | assignment | — |
| risk → control | containment | — |
| item → risk | derived | — |
| item → item (canonical) | logical FK on row | — |

---

## 7. Actions & buttons (generalized)

Buttons map to **action primitives**. Codegen wires them to API calls.

| Action primitive | Typical button label | API pattern | Side effects |
|------------------|---------------------|-------------|--------------|
| `autosave_row` | (none — debounced) | `PATCH /rows/{id}` | projection sync if text fields changed |
| `create_catalog` | Add … | `POST /catalog/{type}` | refresh catalog tab |
| `edit_catalog_row` | Edit / Done | `PATCH /catalog/{id}` | toggle inline mode |
| `open_tag_modal` | + Tag | `PUT /catalog/{id}/tags` | junction + projection |
| `pick_from_catalog` | Tag catalog | `POST /rows/{id}/link-{type}` | junction + projection |
| `open_theme_modal` | Edit themes | `PUT /rows/{id}/themes` | junction only |
| `create_derived` | + Add risk | `POST /hierarchy/risks` | copy context fields |
| `link_existing` | Link existing | `POST /rows/{id}/link-{type}` | junction |
| `delete_catalog` | trash icon | `DELETE /catalog/{id}` | cascade junctions |
| `export_json` | Export JSON | `POST /export` | write files |
| `export_xlsx` | Export XLSX | `GET /export/xlsx` | browser download |
| `export_publish` | Save to GitHub | `POST /publish` | export + git |

**Autosave contract** (from edit.html):

- Debounce ~600ms; compare `JSON.stringify(payload)` to last saved
- Row status: pending → Saving → Saved
- `blur` / select `change` → immediate save
- After save: reload catalogs if projection fields changed

---

## 8. Front-end vs back-end responsibilities

| Concern | Front-end | Back-end |
|---------|-----------|----------|
| Layout / tabs | `views[]` config → panels | serves static `edit.html` or generated UI |
| Field widgets | render by `field.type` | validate via Pydantic from schema |
| Collect row payload | `[data-field]`, box collectors | `update_row(allowed_fields)` |
| M:N picker | shared modal + checkboxes | `set_*_tags()` diff junction |
| Projection text | display boxes built from lines | parse lines on save; format on tag |
| Validation UX | block save, open modal | raise 400 (e.g. duplicative without canonical) |
| Export | trigger buttons | `export_to_json()`, `export_to_xlsx()` |
| Public read | `fetch(json)` only | no API on Pages |

**Goal for generalization:** editor reads schema at startup (`GET /api/schema`) and renders views — no 9k-line hand-coded HTML per site.

---

## 9. Exportability (profiles)

Three export channels with different **include sets**:

| Profile | Destination | Fidelity | Browser download |
|---------|-------------|----------|------------------|
| `sqlite_backup` | copy `app.db` | **Full** | manual |
| `json_export` | `data/*.json` | Publish subset | gap: add zip download |
| `xlsx_export` | `.xlsx` workbook | Rich snapshot (incl. local-only entities) | yes |

Per-entity `export.json` / `export.xlsx` flags in schema. Per-field `publish: true|false`.

**Compliance audit pattern today:**

| Entity | JSON | XLSX |
|--------|------|------|
| items + themes | yes | yes (per checklist sheet) |
| resources | yes | yes |
| themes | yes | yes |
| pocs | partial (string on item) | yes |
| questions | no | yes |
| rcm | no | yes |

---

## 10. Generalizing for a new use case

### Step A — Pick a template package

From `site.schema.json` → `template_packages`:

1. `outline_notes` — container + row only
2. `tagged_knowledge_base` — + catalog + tags
3. `owned_project_tracker` — + owners + questions
4. `audit_compliance` — full pattern
5. `mind_map_canvas` — graph primitives

### Step B — Rename entities (labels only)

Same primitives, different vocabulary:

| Audit | Notes | Mind map |
|-------|-------|----------|
| Checklist | Notebook | Canvas |
| Item | Note | Node |
| Resource | Reference | Attachment |
| Theme | Tag | Cluster |
| POC | Owner | Author |

### Step C — Configure fields on primary row

Add/remove columns in schema → editor grid and XLSX columns follow.

### Step D — Wire connections in Connection Builder UI

See section 11 — no Python editing required.

### Step E — Set deployment + export

```yaml
deployment:
  mode: local_only   # or github_pages | both
export_profiles:
  json: { enabled: true, browser_download: true }
  xlsx: { enabled: true }
```

### Step F — Codegen or generic runtime

**Option 1 — Codegen:** `site.schema.json` → emit `db.py`, routes, minimal editor shell  
**Option 2 — Generic runtime:** one `app.py` + `edit.html` interpret schema at runtime (faster iteration, less per-site code)

---

## 11. Connection Builder UI (design sketch)

**Problem:** Today, relationships require editing `db.py`, `app.py`, and `edit.html` in sync.  
**Goal:** Visual editor that writes `site.schema.json` (or `connections.json`) in one pass.

### 11.1 Builder screens

```
┌─────────────────────────────────────────────────────────────┐
│ Site: My Research KB          [local_only ▼]  [Save schema] │
├──────────────┬──────────────────────────────────────────────┤
│ ENTITIES     │  CONNECTION CANVAS                           │
│ ☑ Container  │                                              │
│ ☑ Primary row│   [Resource]──────tags──────►[Note]          │
│ ☑ Resource   │        │                      │              │
│ ☑ Tag        │        └────themes────────────┘              │
│ ☐ Question   │                                              │
│ ☐ Risk matrix│   Click edge to edit storage + UI + export   │
├──────────────┴──────────────────────────────────────────────┤
│ EDGE INSPECTOR (when edge selected)                         │
│  From: Resource  →  To: Note     Cardinality: M:N           │
│  Storage: [junction ▼]  Table: resource_tags (auto)         │
│  ☑ Mirror to field on Note: [resources ▼]                    │
│     Line format: {title} — {link}                           │
│  UI on catalog: [+ Tag]  UI on row: [Tag catalog]           │
│  Widget: [tag_modal ▼]                                      │
│  Export JSON: ☑   Export XLSX: ☑ (via projection)          │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Builder workflow (no back-and-forth)

1. **Add entity** — pick primitive type, set label plural/singular, enable module
2. **Add fields** — drag field types onto entity card; set enum options, publish flags
3. **Draw connection** — drag from entity A to B; inspector auto-suggests storage type:
   - M:N → junction (default)
   - 1:N → containment FK
   - "also show on row as text" → enable projection sub-panel
4. **Pick UI widgets** — checkbox list of action primitives; maps to buttons
5. **Pick views** — which entities get tabs; primary view = table | graph | outline
6. **Export rules** — per-entity include in json/xlsx
7. **Preview** — generic runtime loads schema live; test without codegen
8. **Generate** — optional scaffold into new folder

### 11.3 What the builder emits

Single artifact: **`site.schema.json`** (already started in Downloads) with:

- `entity_types`
- `relationships` (with `storage`, `projection`, `ui`, `export`)
- `views` + `editor_ux_primitives`
- `export_profiles` + `deployment`
- `actions` — maps button id → handler template

Generic runtime reads this and:

- `CREATE TABLE` from entities + junctions
- Registers routes: `/api/{entity}`, `/api/{entity}/{id}/tags`, etc.
- Renders tabs from `views`
- Attaches action handlers from `actions`

### 11.4 Primitive palette (drag onto canvas)

**Entities:** container, primary_row, catalog_entry, thread, hierarchy  
**Edges:** containment, junction, projection, assignment, embedded, derived  
**Widgets:** primary_grid, catalog_tab, tag_modal, theme_pills, bullet_editor, box_stack, graph_canvas  
**Actions:** autosave_row, open_tag_modal, pick_from_catalog, create_derived, export_xlsx, …

### 11.5 Validation rules (builder enforces)

- Projection requires a `multiline_text` or `text` target field on the "to" entity
- `line_format` must reference fields that exist on "from" entity
- Duplicative / conditional fields require a `validation` block (like `coverage_status` → requires canonical link)
- Junction table names auto-generated: `{from}_{to}_links` unless overridden

---

## 12. Minimal schema example (new use case: research notes)

```json
{
  "site": { "id": "research-notes", "title": "Research Notes", "deployment": { "mode": "local_only" } },
  "entity_types": {
    "notebook": { "primitive": "container", "fields": { "id": "text", "title": "text" } },
    "note": {
      "primitive": "primary_row",
      "fields": {
        "title": "text",
        "body": "bullet_list",
        "references": "multiline_text",
        "status": { "type": "enum", "options": ["draft", "active", "archived"] }
      }
    },
    "reference": { "primitive": "catalog_entry", "fields": { "title": "text", "url": "text", "type": "enum" } },
    "tag": { "primitive": "catalog_entry", "fields": { "name": "text" } }
  },
  "relationships": [
    {
      "id": "notebook_contains_note",
      "storage": "containment",
      "from": "notebook", "to": "note", "cardinality": "1:N"
    },
    {
      "id": "reference_tags_note",
      "storage": "junction",
      "from": "reference", "to": "note", "cardinality": "M:N",
      "projection": {
        "target_field": "note.references",
        "line_format": "{title} — {url}"
      },
      "ui": { "catalog_action": "+ Tag", "row_action": "Tag catalog", "widget": "tag_modal" }
    },
    {
      "id": "tag_tags_note",
      "storage": "junction",
      "from": "tag", "to": "note", "cardinality": "M:N",
      "ui": { "row_action": "Edit tags", "widget": "theme_pills" }
    }
  ],
  "views": [
    { "id": "notes_grid", "type": "primary_grid", "entity": "note" },
    { "id": "refs_catalog", "type": "catalog_tab", "entity": "reference" },
    { "id": "tags_catalog", "type": "catalog_tab", "entity": "tag" }
  ],
  "export_profiles": {
    "json": { "enabled": true, "browser_download": true },
    "xlsx": { "enabled": true, "sheets": ["note", "reference", "tag"] }
  }
}
```

---

## 13. Implementation paths (choose one later)

| Path | Effort | Flexibility |
|------|--------|-------------|
| **A. Schema + codegen** | High upfront | Best for many similar sites |
| **B. Schema + generic runtime** | Medium | Best for Connection Builder iteration |
| **C. Fork a single-site implementation** | Low | Fast one-off, doesn't scale |

Recommended: **B** for the builder UI, with optional codegen for production deploy.

---

## 14. Open questions (for product direction)

See continuation prompt — builder UI scope depends on:

1. Builder is a **standalone web app** or a **tab inside the editor**?
2. Target user: **you (technical)** or **non-developers**?
3. First new use case: **notes**, **mind map**, or **audit clone**?
4. Must builder support **projection line_format** visually, or text template is OK?
5. Generic runtime in **Python/FastAPI** (match today) or **Node/Electron** desktop app?

---

## 15. File index

```
dynamic-database-builder/
├── GENERALIZED_SUMMARY.md     ← this file
├── CONTINUATION_PROMPT.md     ← paste-into-chat handoff
├── TECHNICAL_SPEC.md          ← SQLite mapping, projection/junction algorithms
├── site.schema.json           ← machine-readable primitives
├── examples/tagged_knowledge_base.json
├── examples/mind-map.schema.json
└── KNOWLEDGE_SITE_TEMPLATE.md
```
