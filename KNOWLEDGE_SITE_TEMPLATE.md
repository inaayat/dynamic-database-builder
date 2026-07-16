# Knowledge Site Template

**Architecture guide, relationship model, and schema reference**

Derived from the compliance audit reference pattern  
Generated: July 15, 2026

---

## 1. Executive summary

The AI Governance Audit project is a **local-first, JSON-published, static-site** pattern:

| Layer | Role | Location |
|-------|------|----------|
| Working store | Rich editing, relationships, local-only data | `planning.db` (gitignored) |
| Published store | Versioned, deployable data | `data/*.json` (committed) |
| Presentation | Read-only dashboard + contribution entry points | `index.html` on GitHub Pages |

**Data flow:**

```
planning.db  →  export  →  data/*.json  →  git push  →  GitHub Pages
     ↑                           ↑
  run.py / edit.html        sync.py (GitHub Issues)
```

To templatize for note-taking or mind-mapping, declare entities and relationships in `site.schema.json` — not in domain-specific Python/HTML.

**Bundled files:**

- `site.schema.json` — all primitives from the reference pattern
- `examples/mind-map.schema.json` — graph canvas example

---

## 2. Entity types (the nouns)

| Entity | Table | Role | KM / mind-map analogue |
|--------|-------|------|------------------------|
| **Checklist** | `checklists` | Container for structured items | Notebook, canvas, outline |
| **Item** | `items` | Primary row you track | Note, node, task, concept |
| **Resource** | `resources` | Reusable reference (URL, doc) | Citation, backlink, attachment |
| **POC** | `pocs` | Reusable person/team contact | Author, owner, assignee |
| **Theme** | `themes` | Cross-cutting label | Tag, MOC, cluster, branch |
| **Question** | `item_questions` | Open thread on one item | TODO, open question |
| **RCM Risk** | `rcm_risks` | Standalone risk record | Decision, concern |
| **RCM Control** | `rcm_controls` | Child of a risk | Mitigation, action |
| **GitHub Issue** | external | Contributor submission | External intake form |

### Embedded structure on items (not separate entities)

| Field | Storage | Meaning |
|-------|---------|---------|
| `sub_items` | JSON array in text column | Child bullets under aspect (tree fragment) |
| `notes` | Text, bullets separated by `\x1e` | Inline body / scratchpad |
| `resources` | Multiline text | Denormalized display of linked resources |
| `poc` | Single formatted string | Denormalized display of linked POC |

---

## 3. Relationship storage patterns

Relationships use **five storage patterns**. This is the key to templatizing.

### Pattern A — Containment (parent → children)

| From | To | Cardinality | Storage |
|------|----|-------------|---------|
| Checklist | Item | 1:N | `items.checklist_id` FK |
| RCM Risk | RCM Control | 1:N | `rcm_controls.risk_id` FK |

### Pattern B — Junction tables (many-to-many)

| From | To | Junction table | Keys |
|------|----|----------------|------|
| Resource | Item | `resource_tags` | `(resource_id, checklist_id, item_id)` |
| POC | Item | `poc_tags` | `(poc_id, checklist_id, item_id)` |
| Theme | Item | `item_themes` | `(checklist_id, item_id, theme_id)` |
| Theme | Resource | `resource_themes` | `(resource_id, theme_id)` |

**Theme is a hub tag** — links to both primary content (items) and catalog entries (resources).

### Pattern C — Denormalized projection (catalog ↔ item text)

| Catalog | Item field | Sync |
|---------|------------|------|
| Resource | `items.resources` | Tag appends formatted line; save upserts catalog |
| POC | `items.poc` | Tag sets formatted line; save upserts catalog |

Format conventions:
- Resource: `Title — URL (type · submitter) — summary`
- POC: `Team — Name · Role`

Public `index.html` reads simple JSON strings, not junction tables.

### Pattern D — Assignment (entry → catalog, optional)

| From | To | Field |
|------|----|-------|
| Question | POC | `item_questions.poc_id` |
| Resource | GitHub Issue | `resources.issue_number` |

### Pattern E — Provenance / derived (no DB FK)

| From | To | Mechanism |
|------|----|-----------|
| GitHub Issue | Item / Resource | `sync.py` patches JSON |
| Item | RCM Risk | UI copies aspect + notes ("+ Add risk") |

---

## 4. Complete relationship matrix

```
                    Item    Resource   POC    Theme   Question   Risk   Control   Checklist   Issue
Item                  —       M:N       M:N     M:N      1:N        —       —        N:1        —
Resource             M:N       —         —      M:N       —        —       —         —        N:1
POC                  M:N       —         —       —       N:1        —       —         —        —
Theme                M:N      M:N        —       —        —        —       —         —        —
Question             1:N       —        N:1      —        —        —       —         —        —
Risk                  —        —         —       —        —        —       1:N       —        —
Control               —        —         —       —        —       N:1      —         —        —
Checklist            1:N       —         —       —        —        —       —         —        —
Issue                 —       1:N        —       —        —        —       —         —        —

Plus:
  Resource ──projects──► Item.resources (text)
  POC      ──projects──► Item.poc (text)
  Item.sub_items[]     (embedded children)
```

---

## 5. Editor UX primitives

The local editor (`edit.html`) is a **relationship workbench** with 7 tabs:

| Tab | Entities | Relationship actions |
|-----|----------|---------------------|
| Checklist | Item | Inline fields; theme pills; notes → questions/RCM; tag resources/POCs |
| Resources | Resource | Catalog edit; **+ Tag** → junction + mirror to item.resources |
| POC | POC | Catalog edit; **+ Tag** → junction + mirror to item.poc |
| Themes | Theme | Link items and resources from theme view |
| Questions | Question | Aggregated view; optional POC assignee |
| RCM | Risk → Control | Standalone matrix; no item FK |

### Reusable UX building blocks

1. **Catalog tab** — manage reusable entities
2. **Primary grid** — edit main entity with inline fields
3. **Tag modal** — many-to-many picker
4. **Projection sync** — junction + inline field stay in sync
5. **Derived action** — create related entity from context (no FK)
6. **Publish boundary** — local-only modules excluded from JSON export

---

## 6. Publish manifest

### Published to `data/*.json`

- Checklist items + theme names on items
- Resources + tags + themes
- Themes + junction tables

### Local-only in `planning.db`

- RCM (risks/controls) — Excel export only
- Questions — editor/API only
- Full POC catalog structure — only `poc` string on items in JSON

---

## 7. Template packages (preset bundles)

| Package | Entities | Best for |
|---------|----------|----------|
| **outline_notes** | Checklist, Item | Simple nested notes |
| **tagged_knowledge_base** | + Resource, Theme | Zettelkasten-style KB |
| **owned_project_tracker** | + POC, Question | Owned tasks with open threads |
| **audit_compliance** | + RCM, GitHub intake | Full compliance audit pattern |
| **mind_map_canvas** | Canvas, Node, NodeLink, Theme | Visual graph (see example schema) |

---

## 8. Site builder UX (how users assemble solutions)

### Step 1 — Choose primary entity + view

| Use case | Primary entity | View |
|----------|----------------|------|
| Checklist / audit | Item | Table |
| Note-taking | Item = note | Table or cards |
| Outline | Item + sub_items | Tree |
| Mind map | Node | Graph canvas |

### Step 2 — Enable modules (checkboxes)

- Resources / References
- Themes / Tags / Clusters
- POCs / Owners
- Questions (local only)
- RCM / Risks (local only)
- GitHub Issue sync

### Step 3 — Wire relationships

Per relationship row: cardinality, storage style (junction | inline | embedded | FK), publish flag.

### Step 4 — Field schema designer

Field types: `text`, `longtext`, `bullets`, `children`, `enum`, `date`, `number`, `position_x/y`.

### Step 5 — View designer

Table, catalog, aggregate, hierarchy, **graph** (mind maps).

### Step 6 — Contribution forms (optional)

GitHub Issue field → relationship mapping.

---

## 9. Mind map extensions (example schema)

The base schema lacks graph primitives. The mind-map example adds:

| Addition | Purpose |
|----------|---------|
| `nodes.parent_id` | True tree (replaces `sub_items`) |
| `node_links` table | Free-form edges with `link_type` |
| `position_x`, `position_y` | Layout persistence |
| `collapsed`, `color` | Visual state |
| Graph view (Cytoscape) | Primary editor |

Everything else ports directly: tags → clusters, resources → references, POC → owners.

### Example seed structure

```json
{
  "id": "product-strategy-2026",
  "title": "Product Strategy 2026",
  "nodes": [
    { "id": "root", "label": "AI Product Strategy", "position_x": 400, "position_y": 300 },
    { "id": "n1", "label": "Customer trust", "parent_id": "root", "clusters": ["Privacy"] }
  ],
  "links": [
    { "from": "n1", "to": "n2", "link_type": "relates", "label": "shared controls" }
  ]
}
```

---

## 10. Schema file reference

### `site.schema.json` sections

| Section | Contents |
|---------|----------|
| `site` | id, title, port, URLs |
| `storage` | DB path, published dir, seed/export direction |
| `relationship_storage_patterns` | Seven pattern definitions |
| `entity_types` | All 8 entities with fields and publish flags |
| `relationships` | 16 enumerated relationships with storage + editor hooks |
| `relationship_matrix` | Quick-reference matrix |
| `checklist_variants` | IIA vs NIST column differences |
| `views` | Table, catalog, aggregate, hierarchy |
| `publish_manifest` | What lands in git vs stays local |
| `editor_ux_primitives` | Reusable UI patterns |
| `intake_forms` | GitHub Issue field mappings |
| `workflows` | Pages deploy + issue sync |
| `template_packages` | Preset bundles |

### `examples/mind-map.schema.json` sections

| Section | Contents |
|---------|----------|
| `extends` | Points to base schema |
| `entity_types` | canvas, node, node_link (replaces checklist/item) |
| `relationships` | parent/child tree + graph edges |
| `views` | graph_canvas, outline_sidebar |
| `publish_manifest` | Canvas JSON with nodes + links arrays |
| `modules` | RCM disabled; node_link required |
| `editor_ux` | Graph-first with inspector panel |

---

## 11. Codegen / runtime next steps

A generator or thin generic runtime would read `site.schema.json` and emit:

1. SQLite schema + migrations (`db.py`)
2. FastAPI routes per entity/relationship
3. Editor tabs from `views` + `editor_ux_primitives`
4. Export/import for `publish_manifest`
5. GitHub workflows from `workflows` + `intake_forms`
6. Public `index.html` for views marked `publish: true`

A single-site compliance audit implementation is effectively **hand-written codegen output** for one instance of this schema.

---

## Appendix A — Item field catalog

| Field | Type | Published | Public dashboard |
|-------|------|-----------|------------------|
| aspect | text | yes | yes |
| description | text | yes | NIST only |
| sub_items | json_array | yes | no |
| notes | bullet_list | yes | no |
| resources | multiline | yes | yes |
| poc | string | yes | yes |
| maturity | enum | yes | yes |
| status | enum | yes | no |
| due_date | date | yes | no |
| effort_hours | float | yes | no |
| themes | via junction | yes | no (editor only) |

---

## Appendix B — API surface (compliance audit pattern)

Grouped by relationship primitive:

- **Items CRUD**: `GET/PATCH /api/items`
- **Resource catalog + tags**: `/api/resources`, `/api/resources/{id}/tags`, `POST /api/items/{id}/tag-resource`
- **POC catalog + tags**: `/api/pocs`, `/api/pocs/{id}/tags`, `POST /api/items/{id}/tag-poc`
- **Themes**: `/api/themes`, `/api/items/{id}/themes`, `/api/resources/{id}/themes`
- **Questions**: `/api/questions`, `/api/items/{id}/questions`
- **RCM**: `/api/rcm/*`
- **Publish**: `POST /api/export`, `POST /api/publish`, `GET /api/export/xlsx`

---

*End of document*
