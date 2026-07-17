# Build Plan: Dynamic Database Builder

**Repository:** `inaayat/dynamic-database-builder`

**Goal:** A single local-first platform where users configure entities, fields, connections, views, actions, and exports for any use case — starting with **notes KB**, then **mind map** — via a **Connections tab inside the editor**, without hand-editing Python/HTML per site.

**Schema artifacts:** `site.schema.json`, `examples/tagged_knowledge_base.json` (this repo)  
**Technical spec:** `TECHNICAL_SPEC.md` (field→SQL mapping, projection/junction algorithms)  
**Approach:** Hybrid — generic runtime for design + preview; optional codegen for frozen deploys

---

## 1. Product vision

### What the user can configure (dimensions)

| Dimension | User configures | Example (notes) | Example (mind map) |
|-----------|-----------------|-----------------|---------------------|
| **Entities** | Which nouns exist | Notebook, Note, Reference, Tag | Canvas, Node, Reference, Cluster |
| **Fields** | Types, labels, enums, required | `body` bullet_list, `status` enum | `position_x/y`, `color`, `collapsed` |
| **Connections** | Storage type, cardinality, projection | Reference tags Note | Node links Node, parent tree |
| **Views** | Primary + catalog tabs | Table + 2 catalogs | **Graph** + outline sidebar |
| **Actions** | Buttons per entity/view | + Tag, Tag catalog, Export XLSX | Draw edge, Add child, Collapse |
| **Export** | JSON / XLSX / DB include sets | 3 sheets | Canvas JSON + graph edges |
| **Deployment** | local_only / github_pages | local_only | local_only first |

### What stays fixed (platform kernel)

- SQLite live DB + FastAPI REST API
- Autosave row pattern (debounced PATCH)
- Shared modals: tag picker, theme/tag pills, catalog CRUD
- Export pipeline: `export_profiles` → JSON files + XLSX workbook
- Schema file as single source of truth (`site.schema.json`)

### Success criteria

1. User opens app → **Design** tab → adds Node entity, draws edge to Reference → saves schema → **Editor** tab reflects changes without code edit
2. Notes KB scaffoldable in &lt;15 minutes from template package
3. Mind map: graph view with draggable nodes, persisted positions, edges with types
4. Compliance/audit use case reproducible as a schema package (`audit_compliance`), not a code fork

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         site.schema.json                                  │
│  entity_types │ relationships │ views │ actions │ export_profiles        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Schema        │     │ Runtime engine   │     │ Codegen (opt.)  │
│ interpreter   │     │ (Python)         │     │ new-site.py     │
│               │     │                  │     │                 │
│ • DDL migrate │     │ • Dynamic routes │     │ • Frozen folder │
│ • Validate    │     │ • CRUD + junction│     │ • Custom hooks  │
│ • Diff        │     │ • Projection sync│     └─────────────────┘
└───────────────┘     └────────┬─────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Editor shell (SPA)  │
                    │  ┌─────┬──────────┐ │
                    │  │Edit │ Design   │ │
                    │  │tabs │ (Builder)│ │
                    │  └─────┴──────────┘ │
                    │  View plugins:       │
                    │  grid | catalog |   │
                    │  graph | outline    │
                    └─────────────────────┘
```

### Repository layout

```
dynamic-database-builder/            # this repo
├── site.schema.json                   # active site config
├── planning.db                        # gitignored
├── run.py
├── requirements.txt
├── kit/
│   ├── schema/
│   │   ├── model.py                   # Pydantic models for schema v1
│   │   ├── loader.py                  # load, validate, migrate schema
│   │   └── defaults/                  # template packages as JSON
│   │       ├── outline_notes.json
│   │       ├── tagged_knowledge_base.json
│   │       ├── mind_map_canvas.json
│   │       └── audit_compliance.json
│   ├── engine/
│   │   ├── db.py                      # generic DDL from schema
│   │   ├── migrations.py              # schema version → ALTER TABLE
│   │   ├── crud.py                    # generic row CRUD
│   │   ├── relationships.py           # junction, projection, assignment
│   │   └── export/
│   │       ├── json_export.py
│   │       └── xlsx_export.py
│   ├── api/
│   │   └── app.py                     # dynamic route registration
│   └── templates/                     # optional codegen output skeleton
├── static/
│   ├── index.html                     # public read-only (optional)
│   ├── editor.html                    # thin shell
│   ├── design.html                    # builder tab (or embedded panel)
│   ├── js/
│   │   ├── schema-client.js           # GET/PATCH /api/schema
│   │   ├── views/
│   │   │   ├── grid-view.js
│   │   │   ├── catalog-view.js
│   │   │   ├── graph-view.js          # Phase 3 — mind map
│   │   │   └── outline-view.js
│   │   ├── widgets/
│   │   │   ├── field-renderers.js
│   │   │   ├── tag-modal.js
│   │   │   ├── bullet-editor.js
│   │   │   └── box-stack.js           # projection display
│   │   └── design/
│   │       ├── entity-panel.js
│   │       ├── connection-canvas.js
│   │       └── edge-inspector.js
│   └── styles.css
└── scripts/
    ├── new_site.py                    # scaffold from package
    └── export_site.py                 # codegen frozen deploy
```

---

## 3. Schema specification (v1.1 extensions)

Extend `site.schema.json` with sections required for runtime + builder.

### 3.1 New top-level sections

```json
{
  "schema_version": "1.1",
  "site": { "id", "title", "port", "deployment": { "mode" } },
  "entity_types": { },
  "relationships": [ ],
  "views": [ ],
  "actions": [ ],
  "export_profiles": { },
  "validation_rules": [ ],
  "format_conventions": {
    "bullet_separator": "\u001e",
    "projection_separators": { "label_url": " — ", "meta": " · " }
  }
}
```

### 3.2 Entity definition (full)

```json
{
  "id": "node",
  "primitive": "primary_row",
  "label": "Node",
  "label_plural": "Nodes",
  "table": "nodes",
  "primary_key": ["canvas_id", "id"],
  "fields": {
    "id": { "type": "string", "required": true },
    "label": { "type": "text", "editor": { "column": true, "order": 1 } },
    "position_x": { "type": "number", "default": 0, "editor": { "hidden": true } },
    "position_y": { "type": "number", "default": 0, "editor": { "hidden": true } }
  },
  "modules": { "enabled": true }
}
```

### 3.3 Relationship definition (full)

```json
{
  "id": "reference_tags_node",
  "from": "reference",
  "to": "node",
  "cardinality": "M:N",
  "storage": "junction",
  "junction": {
    "table": "reference_tags",
    "keys": ["reference_id", "canvas_id", "node_id"]
  },
  "projection": {
    "enabled": true,
    "target_entity": "node",
    "target_field": "references",
    "line_format": "{title} — {link}",
    "sync_triggers": ["tag_save", "row_save"]
  },
  "ui": {
    "catalog_actions": ["open_tag_modal"],
    "row_actions": ["pick_from_catalog"],
    "widget": "tag_modal"
  },
  "export": { "json": true, "xlsx": "expand_tags" }
}
```

### 3.4 View definition

```json
{
  "id": "graph_canvas",
  "type": "graph",
  "entity": "node",
  "edge_relationship": "node_links_node",
  "layout": { "engine": "cytoscape", "persist": ["position_x", "position_y"] },
  "inspector_fields": ["label", "body", "status", "references"],
  "primary": true
}
```

### 3.5 Action definition

```json
{
  "id": "open_tag_modal",
  "label": "+ Tag",
  "handler": "tag_modal",
  "api": { "method": "PUT", "path": "/api/{from_entity}/{id}/tags" },
  "context": ["catalog_row", "catalog_toolbar"]
}
```

### 3.6 Export profile

```json
{
  "json": {
    "enabled": true,
    "browser_download": true,
    "format": "zip",
    "include_entities": ["canvas", "node"],
    "include_junctions": ["node_links", "reference_tags"]
  },
  "xlsx": {
    "enabled": true,
    "sheets": ["auto"],
    "include_local_only": true
  }
}
```

### 3.7 Validation rules (conditional fields)

```json
{
  "id": "duplicative_requires_canonical",
  "entity": "item",
  "when": { "field": "coverage_status", "equals": "duplicative" },
  "require": ["canonical_checklist_id", "canonical_item_id"],
  "ui": { "block_save": true, "open_modal": "canonical_link" }
}
```

---

## 4. Runtime engine (backend)

### 4.1 Schema loader

| Task | Detail |
|------|--------|
| Load `site.schema.json` on startup | Hot-reload when schema PATCHed from Design tab |
| Validate | JSON Schema + semantic checks (projection targets exist, FK types match) |
| Version migrate | `schema_version` in DB meta table; apply additive migrations |

### 4.2 Dynamic DDL

On schema load or change:

1. For each `entity_types` → `CREATE TABLE IF NOT EXISTS`
2. For each `junction` relationship → create junction table
3. Field type → SQL column type mapping (documented table)
4. **Destructive changes** → warn in Design tab; require export backup before apply

### 4.3 Generic CRUD API

| Endpoint pattern | Behavior |
|------------------|----------|
| `GET /api/schema` | Full schema for editor + design |
| `PATCH /api/schema` | Design tab saves (validate → migrate → reload) |
| `GET /api/{entity}` | List rows (query: container_id) |
| `GET /api/{entity}/{id}` | Single row + joined relations |
| `PATCH /api/{entity}/{id}` | Update allowed fields; run projection sync hooks |
| `POST /api/{entity}` | Create catalog/container rows |
| `DELETE /api/{entity}/{id}` | Cascade per FK rules |
| `PUT /api/{entity}/{id}/tags` | Generic junction setter (relationship id in body) |
| `POST /api/export` | JSON per export_profiles |
| `GET /api/export/xlsx` | XLSX stream |
| `GET /api/export/json.zip` | Browser-downloadable backup |

### 4.4 Relationship engine (`relationships.py`)

Implement once, driven by schema:

| Storage | Functions |
|---------|-----------|
| `junction` | `set_tags(rel_id, from_id, to_ids)` — diff insert/delete |
| `projection` | `append_line`, `remove_line`, `parse_lines`, `format_line` — use `format_conventions` |
| `containment` | Filter lists by `container_id` FK |
| `assignment` | Set nullable FK on child |
| `embedded` | Serialize/deserialize bullet_list, json_array |

**Hook on PATCH:** if updated field is projection target → `sync_catalog_from_projection`; if source catalog field → `sync_projection_from_catalog`.

### 4.5 Export engine

| Format | Generator logic |
|--------|-----------------|
| JSON | One file per container or entity type per `export_profiles.json` |
| XLSX | One sheet per view type `grid` + one per `catalog`; graph exports positions as columns |
| ZIP | Bundle all JSON + optional `schema.json` snapshot |

---

## 5. Editor shell (frontend)

### 5.1 Two modes in one app

| Mode | Tab | Purpose |
|------|-----|---------|
| **Edit** | Checklist / Graph / Catalogs… | Use the configured site |
| **Design** | Connections & schema | Configure entities, fields, edges, exports |

Toggle: top-level `Edit | Design` — Design writes schema; Edit consumes it.

### 5.2 View plugins (register by `view.type`)

| Plugin | Phase | Renders |
|--------|-------|---------|
| `grid` | 1 | Primary row table — columns from `field.editor.column` |
| `catalog` | 1 | Sortable catalog table + Add / Edit / + Tag |
| `aggregate` | 2 | Cross-entity list (questions-style) |
| `hierarchy` | 2 | Parent/child matrix (RCM-style) |
| `outline` | 3 | Tree from `parent_id` |
| `graph` | 3 | Cytoscape canvas — mind map |

### 5.3 Field renderers (register by `field.type`)

| Type | Widget |
|------|--------|
| `text`, `longtext` | input / textarea |
| `bullet_list` | bullet-editor (add/remove rows, join with separator) |
| `enum` | select from options |
| `multiline_text` + projection | box-stack (parsed lines) |
| `number` | input type=number |
| `boolean` | checkbox |
| `foreign_key` | dropdown populated from catalog entity |

### 5.4 Shared widgets (generalized editor modules)

Extract into reusable modules:

- `tag-modal.js` — parameterized by relationship id
- `theme-pills.js` — for junction-only tag entities
- `autosave-row.js` — `scheduleSave`, `rowPayload`, status indicator
- `toast.js`, `modal.js`

---

## 6. Design tab (Connection Builder UI)

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [Edit] [Design]                    Package: [mind_map_canvas ▼] │
├─────────────┬───────────────────────────┬─────────────────────────┤
│ ENTITIES    │ CONNECTION CANVAS          │ INSPECTOR               │
│             │                            │                         │
│ + Add       │  [Canvas]──contains──►[Node]│ (entity or edge       │
│ ☑ Canvas    │     │                      │  selected)              │
│ ☑ Node      │     ├──links──►[Node]     │                         │
│ ☑ Reference │     │                      │ Fields / storage / UI   │
│ ☑ Cluster   │  [Ref]──tags──►[Node]      │ Export flags            │
│             │  [Cluster]──tags──►[Node]   │                         │
├─────────────┴───────────────────────────┴─────────────────────────┤
│ [Validate schema]  [Preview in Edit tab]  [Apply & migrate DB]      │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 User flows

**Add entity**

1. Click + Add → pick primitive (container, primary_row, catalog_entry, thread, hierarchy)
2. Set singular/plural labels → auto-suggest table name
3. Inspector shows field list → Add field → pick type, options, column visibility

**Add connection**

1. Drag from entity A port to entity B port
2. Inspector suggests storage:
   - 1:N → containment
   - M:N → junction (default)
   - Toggle "Mirror on row as text" → enables projection sub-form
3. Pick UI widgets from checklist (tag modal, pills, etc.)
4. Set export inclusion

**Apply schema**

1. Validate → show errors (missing projection field, broken FK)
2. Preview diff (new tables, new columns)
3. Apply → backend migrates DB → switch to Edit tab

### 6.3 Template packages (starting points)

| Package | Load in Design | User then… |
|---------|----------------|------------|
| `tagged_knowledge_base` | Notes KB | Rename labels, add fields |
| `mind_map_canvas` | Mind map | Customize edge types, colors |
| `audit_compliance` | Full audit | Import seed checklist JSON |

### 6.4 Design tab API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/schema` | Load current |
| PATCH | `/api/schema` | Partial update from builder |
| POST | `/api/schema/validate` | Dry-run validation |
| POST | `/api/schema/apply` | Migrate DB + reload |
| POST | `/api/schema/package/{id}` | Reset from template package |

---

## 7. Phased delivery plan

### Phase 0 — Foundation (1–2 weeks)

**Deliverables**

- [ ] Repo `dynamic-database-builder` with `kit/schema/model.py` (Pydantic v1 schema)
- [ ] Schema loader + validator
- [ ] `GET /api/schema` returns bundled default `tagged_knowledge_base`
- [ ] Empty SQLite with meta table (`schema_version`, `site_id`)
- [ ] `editor.html` shell: Edit tab placeholder, Design tab placeholder
- [ ] Document field type → SQL mapping

**Exit:** App runs; schema served as JSON; no editing yet.

---

### Phase 1 — Notes KB (generic runtime) (2–3 weeks)

**Goal:** Reproduce notes use case entirely from schema + generic runtime.

**Deliverables**

- [ ] Dynamic DDL for container + primary_row + catalog_entry
- [ ] Junction + projection engine (implement per TECHNICAL_SPEC.md §2–3)
- [ ] Generic CRUD routes
- [ ] `grid` view plugin — columns from schema, autosave PATCH
- [ ] `catalog` view plugin — Resources/Tags style
- [ ] `tag-modal` widget — driven by relationship id
- [ ] `bullet_list` + `box_stack` field renderers
- [ ] JSON export + XLSX export (3 sheets: notes, references, tags)
- [ ] `GET /api/export/json.zip`
- [ ] Default package: `tagged_knowledge_base.json`

**Exit:** User runs app, edits notes with references/tags, exports JSON + XLSX — all from schema.

**Core algorithms:** See TECHNICAL_SPEC.md — `set_tags`, projection sync, autosave debounce, XLSX sheet builder.

---

### Phase 2 — Design tab (Connection Builder) (2–3 weeks)

**Goal:** User configures notes KB (and tweaks) without editing JSON by hand.

**Deliverables**

- [ ] Entity panel: add/remove entities, add/remove fields
- [ ] Connection canvas (simplified: list of edges + entity boxes — full drag canvas optional v2)
- [ ] Edge inspector: storage type, projection toggle, line_format, UI actions
- [ ] `PATCH /api/schema` + `POST /api/schema/apply` with migration diff preview
- [ ] Validation rules UI (optional: v2)
- [ ] Package picker: load `tagged_knowledge_base`, save as custom package
- [ ] "Preview in Edit" switches tab with hot-reloaded views

**Exit:** User adds a new field to Note in Design → Apply → Edit tab shows new column.

---

### Phase 2.5 — Guided workspace setup (UX clarity)

**Goal:** First-time Design feels like setting up a **workspace**, not editing a schema. Sequential flow; friendly names only in UI.

**Deliverables**

- [x] Empty / first-run state: Start from Notes **template** or blank workspace
- [x] Guided order: Entities → Fields (“types of values”) → Connections → Views → Apply Changes
- [x] Add Entity / Add Field modals (cards + catalogs; no raw `prompt()` for primary path)
- [x] Suggested connections from current entities (recipes); Custom still available
- [x] Collapse long help into one “How Design works” strip; panel copy stays one sentence
- [x] UI copy uses **Workspace** / **Template** / **Apply Changes** (see §10 glossary)
- [x] Do **not** build multi-workspace switcher yet — one active workspace only
- [x] Advanced editor toggle keeps 3-column Design for power users

**Exit:** New user can create Notes + Tags, add a field, connect them, Apply, and edit in Edit without reading TECHNICAL_SPEC.

---

### Phase 3 — Mind map (3–4 weeks)

**Goal:** Next use case — graph canvas with nodes, edges, layout persistence.

**Schema additions**

- [ ] Entity `node` with `position_x`, `position_y`, `parent_id`, `collapsed`, `color`
- [ ] Entity `canvas` (container)
- [ ] Relationship `node_links_node` — junction with `link_type`, `label`
- [ ] Relationship `node_parent_child` — containment via `parent_id` (optional parallel to links)
- [ ] Package `mind_map_canvas.json`

**Backend**

- [ ] Junction table for edges with extra columns (`link_type`, `label`)
- [ ] Batch position update: `PATCH /api/nodes/positions` (drag performance)
- [ ] Graph export: canvas JSON with `nodes[]` + `links[]`

**Frontend**

- [ ] `graph` view plugin — **Cytoscape.js**
  - Drag node → debounced position save
  - Draw edge mode → POST link
  - Click node → inspector panel (fields from schema)
  - Collapse subtree (if `parent_id` enabled)
  - Filter by cluster/tag
- [ ] `outline` view plugin — tree sidebar synced with graph selection
- [ ] Reuse catalog plugins: Reference, Cluster on nodes (projection + junction)

**Design tab**

- [ ] Graph view config in inspector (layout engine, persist fields)
- [ ] Edge relationship: pick `link_type` enum options

**Exit:** User loads mind_map package, builds canvas in graph view, tags nodes with clusters/references, exports JSON graph + XLSX.

---

### Phase 4 — Parity extras (2 weeks, parallelizable)

- [ ] `aggregate` view (questions-style catalog)
- [ ] `hierarchy` view (RCM-style)
- [ ] Validation rules engine (`duplicative` pattern)
- [ ] `audit_compliance` package — prove full audit pattern is schema-only
- [ ] Optional: `deployment.github_pages` + static `index.html` generator from schema

---

### Phase 5 — Codegen & polish (1–2 weeks)

- [ ] `scripts/export_site.py` — freeze generic runtime + schema into deployable folder
- [ ] `scripts/new_site.py` — `new-site my-map --package mind_map_canvas`
- [ ] Schema import from bundled compliance seed JSON
- [ ] Design tab: visual drag canvas (upgrade from list-based edges)
- [ ] Tests: schema validation, projection round-trip, junction diff, export snapshots
- [ ] Multi-workspace (optional): list / switch / duplicate workspaces; one SQLite file per workspace; UI says Workspace not schema/build

---

## 8. Mind map — detailed spec (Phase 3)

### 8.1 Entities & fields

| Entity | Fields | Notes |
|--------|--------|-------|
| **canvas** | id, title, description, default_layout | Container |
| **node** | id, canvas_id, label, body (bullets), position_x, position_y, parent_id, collapsed, color, status, references (projection) | Primary |
| **reference** | id, title, link, type, summary | Catalog |
| **cluster** | id, name, description | Catalog (= theme) |

### 8.2 Relationships

| ID | Storage | UI |
|----|---------|-----|
| canvas_contains_node | containment | graph palette |
| node_links_node | junction + edge attrs | draw edge tool |
| node_parent_child | parent_id FK | drag-to-reparent or outline |
| reference_tags_node | junction + projection | tag modal |
| cluster_tags_node | junction | pills on inspector |

### 8.3 Graph view behavior

| Interaction | Action |
|-------------|--------|
| Drag node | PATCH position_x/y (batch) |
| Double-click canvas | Create node at coords |
| Shift+click two nodes | Create link with default type |
| Right-click edge | Edit type/label/delete |
| Inspector | Standard field renderers |
| Outline click | Center graph on node |

### 8.4 Export (mind map)

**JSON** (`data/{canvas_id}.json`):

```json
{
  "id": "my-canvas",
  "title": "...",
  "nodes": [{ "id", "label", "position_x", "position_y", "parent_id", "clusters": [] }],
  "links": [{ "from", "to", "link_type", "label" }]
}
```

**XLSX:** sheets Canvas nodes, Links, References, Clusters

---

## 9. Mapping compliance audit pattern → schema packages

Prove generalization by encoding the audit use case as data:

| Audit pattern concept | Schema primitive |
|----------------------|------------------|
| checklists | container × 3 |
| items | primary_row |
| resources, pocs, themes | catalog_entry |
| questions | thread + junctions |
| rcm | hierarchy |
| resource_tags + items.resources | junction + projection |
| coverage_status + canonical | validation_rules |
| edit.html tabs | views[] |
| Export JSON / XLSX | export_profiles |

**Phase 4 deliverable:** `audit_compliance.json` loads and migrates bundled compliance seed data.

---

## 10. Technical decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Builder location | Tab inside editor | Your preference; immediate preview |
| Runtime | Hybrid | Design in generic runtime; codegen when stable |
| Backend | Python/FastAPI/SQLite | Match reference impl |
| Graph library | Cytoscape.js | Mature, JSON-friendly |
| Schema format | JSON file | Git-friendly, builder reads/writes same artifact |
| First package | tagged_knowledge_base | Notes before mind map |
| Second package | mind_map_canvas | Phase 3 |
| Schema hot-reload | Hot-reload views; DB migrate on **Apply Changes** only | Design can iterate without wiping data mid-edit |
| Active workspace (v1) | **One** active workspace per app instance | `data/active-schema.json` + one SQLite DB (`planning.db`) |
| Multi-workspace | Deferred (Phase 5+) | Plan naming now; don't build switcher yet |
| User-facing name | **Workspace** | Avoid “build” (sounds like compile) and leading with “schema” in UI |
| Internal / file name | `schema` / `site` / template packages | Keep code + JSON paths as-is |

### Naming glossary (UI vs code)

| Layer | Call it in UI | Call it in code / files | Role |
|-------|---------------|-------------------------|------|
| Living app the user is making | **Workspace** | `site` / active schema + DB | Schema + data + views together |
| Machine-readable config | Schema (Advanced / docs only) | `schema`, `site.schema.json`, `active-schema.json` | Entities, fields, connections, views |
| Starter configs | **Templates** | `kit/schema/defaults/*.json`, `package/{id}` | Seed a new workspace (not the workspace itself) |
| Saved user variant (later) | Saved design / snapshot | export zip or custom package | Backup or reusable starting point |

**Do not call workspaces “builds.”** Prefer: “Set up your workspace,” “Apply Changes,” “Start from a template.”

### Multi-workspace (later — Phase 5+)

When needed:

```
My Workspaces
├── Research Notes     ← active
├── Mind Map Sprint
└── Audit Checklist
```

Each workspace = own schema JSON + own SQLite file (simplest isolation). Switching loads that workspace’s schema + DB into Edit/Design.

**v1 escape hatch (no switcher):** Export JSON / XLSX; later “Duplicate workspace” or “New workspace from template.”

Leave room in the model now: every workspace has `id`, `title`, schema path, db path — already partially present as `site.id` / `site.title` / `storage.local_db`.

### First-time Design flow (Phase 2.5)

Guided setup order (matches how users think):

1. **Entities** — what am I tracking? (Collection / Item / Reference)
2. **Fields** — what kinds of values does each store?
3. **Connections** — how do they relate? (One to Many / Many to Many / Optional Link)
4. **Views** — how do I look at them? (Table / List; more later)
5. **Apply Changes** — make it live in Edit

After first setup, keep the 3-column Design builder for tweaks. Templates pre-fill a sensible Notes workspace so most users tweak instead of inventing from zero.

### Open (decide later)

| Question | Options |
|----------|---------|
| Public read-only generator | Phase 4+ |
| Multi-workspace UI (list / switch / duplicate) | Phase 5+ |
| Shared DB with `workspace_id` vs one file per workspace | Prefer one SQLite file per workspace unless proven otherwise |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Projection parsing fragile | Centralize format engine; unit tests; builder shows line preview |
| Schema migration breaks data | Diff preview + auto-export before Apply |
| graph view complexity | Phase 3 isolated; notes KB shippable without graph |
| edit.html 9k lines port | Extract widgets incrementally; don't big-bang |
| Scope creep | Strict phase exits; mind map only after Design tab works |

---

## 12. Effort summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 0 Foundation | 1–2 wk | 2 wk |
| 1 Notes KB runtime | 2–3 wk | 5 wk |
| 2 Design tab | 2–3 wk | 8 wk |
| 2.5 Guided workspace setup | 1–2 wk | 10 wk |
| 3 Mind map | 3–4 wk | 14 wk |
| 4 Parity extras | 2 wk | 16 wk |
| 5 Codegen / multi-workspace polish | 1–2 wk | 18 wk |

*Solo developer estimate; parallel work on graph plugin + export can compress Phase 3.*

---

## 13. First sprint checklist (start here)

Week 1:

1. Create `dynamic-database-builder` repo structure (§2)
2. Implement Pydantic schema models matching §3
3. Load `tagged_knowledge_base` default package
4. `GET /api/schema` + static `editor.html` with Edit/Design tabs
5. Spike: one dynamic table `notes` + `PATCH /api/notes/{id}`

Week 2:

6. Junction table creation from schema
7. Implement projection sync (minimal: reference → note) per TECHNICAL_SPEC.md §2
8. Grid view: one container, one primary row, two columns
9. Autosave working end-to-end

---

## 14. Related files

| File | Purpose |
|------|---------|
| `GENERALIZED_SUMMARY.md` | Conceptual model |
| `CONTINUATION_PROMPT.md` | Chat handoff |
| `site.schema.json` | Schema v1 (extend to v1.1 per §3) |
| `examples/mind-map.schema.json` | Mind map seed |

---

## 15. Session goal templates

**Phase 1 sprint:**
> Implement dynamic-database-builder Phase 0–1: schema loader, dynamic DDL for tagged_knowledge_base, generic PATCH with projection sync, grid + catalog views.

**Phase 3 mind map:**
> Add graph view plugin (Cytoscape), node_links junction, batch position API, mind_map_canvas package — on top of working Design tab.
