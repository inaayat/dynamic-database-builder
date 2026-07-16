# Technical Specification — Dynamic Database Builder

Normative reference for the generic runtime engine.

**Related:** `BUILD_PLAN.md`, `GENERALIZED_SUMMARY.md`, `examples/tagged_knowledge_base.json`

---

## 1. Field type → SQLite column mapping

### 1.1 Mapping table

| Schema `field.type` | SQLite type | Nullable | Default | PK | Notes |
|---------------------|-------------|----------|---------|-----|-------|
| `string` | `TEXT` | per field | `''` or none | often yes | Short identifiers (`id`) |
| `text` | `TEXT` | `NOT NULL` | `''` | no | Single-line / short textarea |
| `longtext` | `TEXT` | `NOT NULL` | `''` | no | Summaries, descriptions |
| `url` | `TEXT` | `NOT NULL` | `''` | no | Validated in API layer, not DB |
| `bullet_list` | `TEXT` | `NOT NULL` | `''` | no | Serialized; see §1.2 |
| `json_array` | `TEXT` | `NOT NULL` | `'[]'` | no | `json.dumps` / `json.loads` |
| `multiline_text` | `TEXT` | `NOT NULL` | `''` | no | Newline-separated lines; projection target |
| `enum` | `TEXT` | `NOT NULL` | first option or `''` | no | Validated against `options[]` in API |
| `date` | `TEXT` | varies | `NULL` or `''` | no | ISO `YYYY-MM-DD` |
| `datetime` | `TEXT` | `NULL` | `NULL` | no | ISO 8601 |
| `integer` | `INTEGER` | per field | none | often yes | Row ids within container |
| `number` | `REAL` | `NULL` | `NULL` | no | `effort_hours`, coordinates |
| `boolean` | `INTEGER` | `NOT NULL` | `0` | no | `0` = false, `1` = true |
| `foreign_key` | `TEXT` or `INTEGER` | varies | `NULL` | no | Match referenced PK type; `ON DELETE` per schema |

### 1.2 Serialization rules

**`bullet_list`**

```
DB storage:  "bullet one\x1ebullet two\x1ebullet three"
API / UI:    ["bullet one", "bullet two", "bullet three"]

serialize(bullets):
  return SEP.join(b.strip() for b in bullets if b.strip())

deserialize(text):
  if SEP in text: return [p.strip() for p in text.split(SEP) if p.strip()]
  return [line.strip() for line in text.split("\n") if line.strip()]
```

Default `SEP` = `\x1e` (ASCII record separator). Configurable via `format_conventions.bullet_separator`.

**`json_array`**

```
DB storage:  '["child a","child b"]'
API / UI:    ["child a", "child b"]

serialize(arr):  json.dumps(arr, ensure_ascii=False)
deserialize(s):  json.loads(s or "[]")
```

**`multiline_text` (projection field)**

```
DB storage:  "Line one\nLine two\nLine three"
API / UI:    same string; editor may render as box_stack per line
```

### 1.3 DDL generation (generic runtime)

```sql
-- Pseudocode: emit CREATE TABLE for entity E
CREATE TABLE IF NOT EXISTS {E.table} (
  {for each field f in E.fields ordered: PK first}
  {f.name} {f.sqlite.column}
    {PRIMARY KEY if part of E.primary_key}
    {NOT NULL unless f.sqlite.nullable}
    {DEFAULT f.sqlite.default if set}
    {REFERENCES ... ON DELETE ... if foreign_key}
  {end}
);

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

**Junction table template** (relationship `storage: junction`):

```sql
CREATE TABLE IF NOT EXISTS {junction.table} (
  {for each key in junction.keys}
  {key} {TYPE} NOT NULL,
  PRIMARY KEY ({keys joined}),
  FOREIGN KEY ({from_id}) REFERENCES {from.table}(id) ON DELETE CASCADE
);
```

### 1.4 Nullable vs required conventions

| Case | Rule |
|------|------|
| Primary key columns | `NOT NULL` always |
| `schema.required: true` | `NOT NULL`; reject empty on create in API |
| Optional dates (`due_date`) | `NULL` allowed; omit from JSON export when null |
| Optional FK (`owner_poc_id`, `poc_id`) | `NULL` allowed; `ON DELETE SET NULL` |
| Text fields with UI always showing value | `NOT NULL DEFAULT ''` |
| Boolean | `NOT NULL DEFAULT 0` |

### 1.5 Example: compliance-pattern `items` row (illustrative)

| Column | SQLite | Nullable | Default |
|--------|--------|----------|---------|
| `checklist_id` | TEXT | NOT NULL | — (PK) |
| `id` | INTEGER | NOT NULL | — (PK) |
| `aspect` | TEXT | NOT NULL | — |
| `resources` | TEXT | NOT NULL | `''` |
| `maturity` | TEXT | NOT NULL | `''` |
| `poc` | TEXT | NOT NULL | `''` |
| `sub_items` | TEXT | NOT NULL | `'[]'` |
| `status` | TEXT | NOT NULL | `'not_started'` |
| `coverage_status` | TEXT | NOT NULL | `'unknown'` |
| `canonical_checklist_id` | TEXT | NULL | — |
| `canonical_item_id` | INTEGER | NULL | — |
| `due_date` | TEXT | NULL | — |
| `effort_hours` | REAL | NULL | — |
| `notes` | TEXT | NOT NULL | `''` |
| `description` | TEXT | NOT NULL | `''` |

---

## 2. Projection sync pseudocode

Projection keeps a **junction table** (source of truth for links) and a **formatted text field** on the target row (display + JSON export) in sync.

### 2.1 Configuration (from schema)

```yaml
relationship: reference_tags_note
projection:
  target_entity: note
  target_field: references      # multiline_text on note
  line_format: "{title} — {link}"
  optional_meta_format: " ({type})"
  sync_triggers: [tag_save, row_save]
format_conventions:
  label_value_sep: " — "
  meta_sep: " · "
```

### 2.2 Format helpers

```python
LABEL_VALUE_SEP = " — "
META_SEP = " · "

def format_projection_line(catalog_row: dict, rel: ProjectionConfig) -> str:
    """Build display line from catalog record."""
  # Example: "Policy doc — https://example.com (Article)"
    line = rel.line_format.format(**catalog_row)
    meta_parts = [catalog_row.get("type"), catalog_row.get("submitted_by")]
    meta = META_SEP.join(p for p in meta_parts if p)
    if meta and rel.optional_meta_format:
        line += f" ({meta})"
    return line.strip()

def parse_projection_line(line: str) -> tuple[str, str]:
    """Split 'Title — URL remainder' into (label, rest)."""
    line = line.strip()
    if not line:
        return "", ""
    idx = line.find(LABEL_VALUE_SEP)
    if idx > 0:
        return line[:idx].strip(), line[idx + len(LABEL_VALUE_SEP):].strip()
    if line.lower().startswith(("http://", "https://")):
        return "", line
    return line, ""

def line_matches_catalog(catalog_row: dict, line: str) -> bool:
    formatted = format_projection_line(catalog_row, rel)
    if line.strip() == formatted:
        return True
    simple = f"{catalog_row['title']}{LABEL_VALUE_SEP}{catalog_row['link']}".strip()
    return line.strip() == simple or line.strip().startswith(simple)

def normalize_url(url: str) -> str:
    """Lowercase, strip trailing slash — dedupe key for catalog upsert."""
    return url.strip().rstrip("/").lower()
```

### 2.3 Tag save path (catalog → row)

**Trigger:** `PUT /api/references/{id}/tags` or `POST /api/notes/{id}/tag-reference`

```python
def set_tags(conn, relationship_id, from_id, new_tag_refs):
    """
    relationship_id: e.g. reference_tags_note
    from_id: catalog row id (reference_id)
    new_tag_refs: [{notebook_id, note_id}, ...]
    """
    rel = schema.relationships[relationship_id]
    catalog = load_catalog_row(conn, rel.from, from_id)
    old_refs = get_junction_refs(conn, rel.junction, from_id)
    old_keys = {tag_key(r) for r in old_refs}
    new_keys = {tag_key(r) for r in new_tag_refs}

    # --- junction diff (see §3) ---
    for ref in sorted(new_keys - old_keys):
        insert_junction(conn, rel.junction, from_id, ref)
        if rel.projection.enabled:
            append_projection_line(conn, rel, ref, catalog)

    for ref in sorted(old_keys - new_keys):
        delete_junction(conn, rel.junction, from_id, ref)
        if rel.projection.enabled:
            remove_projection_line(conn, rel, ref, catalog)

    conn.commit()
    return load_catalog_with_tags(conn, rel.from, from_id)


def append_projection_line(conn, rel, target_ref, catalog_row):
    """Append formatted line to note.references if not already present."""
    target = load_row(conn, rel.projection.target_entity, target_ref)
    line = format_projection_line(catalog_row, rel.projection)
    existing = (target[rel.projection.target_field] or "").split("\n")
    for ex in existing:
        if line_matches_catalog(catalog_row, ex):
            return  # idempotent
    text = target[rel.projection.target_field] or ""
    new_text = f"{text}\n{line}".strip() if text.strip() else line
    update_field(conn, target, rel.projection.target_field, new_text)


def remove_projection_line(conn, rel, target_ref, catalog_row):
    target = load_row(conn, rel.projection.target_entity, target_ref)
    lines = [l for l in (target[rel.projection.target_field] or "").split("\n") if l.strip()]
    filtered = [l for l in lines if not line_matches_catalog(catalog_row, l)]
    update_field(conn, target, rel.projection.target_field, "\n".join(filtered))
```

### 2.4 Row save path (row → catalog)

**Trigger:** `PATCH /api/notes/{id}` when `references` field changes

```python
def patch_row(conn, entity, container_id, row_id, fields):
    row = update_allowed_fields(conn, entity, container_id, row_id, fields)

    for rel in schema.relationships_with_projection_to(entity, field_in=fields):
        if "row_save" not in rel.projection.sync_triggers:
            continue
        if rel.projection.target_field in fields:
            sync_projection_field_to_catalog(conn, rel, row)

    conn.commit()
    return row


def sync_projection_field_to_catalog(conn, rel, target_row):
    """
    Parse multiline projection field; upsert catalog entries; ensure junction rows.
    """
    text = target_row[rel.projection.target_field] or ""
    seen_keys = set()  # normalized URL or POC key

    for line in text.split("\n"):
        label, rest = parse_projection_line(line)
        url = extract_url(rest)  # first http(s) token
        if not url:
            continue
        key = normalize_url(url)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        catalog_row = upsert_catalog_by_link(conn, rel.from, {
            "title": label or url,
            "link": url,
            # optional: parse (meta) from rest for type/submitted_by
        })

        ref = target_ref_from_row(target_row)
        insert_junction_ignore(conn, rel.junction, catalog_row["id"], ref)
```

### 2.5 Round-trip invariant

After any sequence of **tag save** and **row save** operations:

1. Every junction `(catalog_id, target_ref)` has a matching line in `target_field` (modulo formatting equivalence via `line_matches_catalog`).
2. Every parseable line in `target_field` with a valid URL has a catalog row and junction entry.
3. Tag-only entities (no projection) skip steps 2.4 — junction is sole source of truth.

### 2.6 POC projection variant

Same algorithm; different parsers:

```python
POC_LINE_SEP = " — "
POC_ROLE_SEP = " · "

def format_poc_line(team, name, role=""):
    base = f"{team}{POC_LINE_SEP}{name}" if team else name
    return f"{base}{POC_ROLE_SEP}{role}" if role else base

def parse_poc_line(line) -> (team, name, role):
    # split role from right by POC_ROLE_SEP, then team/name by POC_LINE_SEP
    ...

def poc_key(team, name) -> tuple:
    return (team.strip().lower(), name.strip().lower())
```

`sync_projection_field_to_catalog` for POC fields dedupes by `poc_key(team, name)` not URL.

---

## 3. Junction diff algorithm (`set_tags`)

Generalized M:N membership update for any relationship with optional projection side effects.

### 3.1 Types

```python
TagRef = dict  # e.g. {"notebook_id": "main", "note_id": 1}
TagKey = tuple  # hashable key for set ops, e.g. ("main", 1)

def tag_key(ref: TagRef, junction_keys: list[str]) -> TagKey:
    """Build comparable key from junction columns excluding catalog_id."""
    # resource_tags: (checklist_id, item_id) or (notebook_id, note_id)
    return tuple(ref[k] for k in junction_keys if k != f"{from_entity}_id")
```

### 3.2 Algorithm

```python
def set_tags(
    conn,
    relationship: Relationship,
    from_id: str,
    new_refs: list[TagRef],
) -> dict:
    """
    Replace junction membership for one catalog row.
    Idempotent. Runs projection append/remove when configured.
    """
    # 0. Validate catalog row exists
    catalog = get_row(conn, relationship.from_entity, from_id)
    if catalog is None:
        raise KeyError(from_id)

    # 1. Normalize input
    new_refs = [normalize_ref(r) for r in new_refs]
    old_refs = get_junction_refs(conn, relationship.junction, from_id)

    # 2. Compute set difference on keys
    old_keys = {tag_key(r, relationship.junction.keys): r for r in old_refs}
    new_keys = {tag_key(r, relationship.junction.keys): r for r in new_refs}

    added   = set(new_keys.keys()) - set(old_keys.keys())
    removed = set(old_keys.keys()) - set(new_keys.keys())

    # 3. INSERT additions
    for key in sorted(added):
        ref = new_keys[key]
        execute(conn, """
            INSERT OR IGNORE INTO {junction.table}
            ({all junction columns})
            VALUES ({placeholders})
        """, from_id, ref)

        if relationship.projection and relationship.projection.enabled:
            append_projection_line(conn, relationship, ref, catalog)

    # 4. DELETE removals
    for key in sorted(removed):
        ref = old_keys[key]
        execute(conn, """
            DELETE FROM {junction.table}
            WHERE {from_id_col} = ? AND {match other key columns}
        """, from_id, ref)

        if relationship.projection and relationship.projection.enabled:
            remove_projection_line(conn, relationship, ref, catalog)

    # 5. Optional legacy single-tag column on catalog row
    if relationship.legacy_single_tag_column:
        first = new_refs[0] if new_refs else None
        update_legacy_column(conn, from_id, first)

    conn.commit()
    return load_with_tags(conn, relationship.from_entity, from_id)
```

### 3.3 Single-tag convenience

```python
def tag_one(conn, relationship_id, from_id, target_ref):
    tags = get_junction_refs(conn, ...)
    if target_ref not in tags:
        set_tags(conn, relationship, from_id, tags + [target_ref])
    else:
        # still ensure projection line exists
        append_projection_line(...)
```

### 3.4 Junction-only (no projection) — themes example

```python
def set_item_themes(conn, checklist_id, item_id, theme_ids):
    old_ids = SELECT theme_id FROM item_themes WHERE ...
    new_ids = set(theme_ids)

    for id in new_ids - old_ids:
        INSERT OR IGNORE INTO item_themes ...
    for id in old_ids - new_ids:
        DELETE FROM item_themes WHERE theme_id = ? ...

    commit()
    # NO update to item row text — themes joined at read time
```

### 3.5 Complexity and ordering

| Property | Value |
|----------|-------|
| Time | O(\|old\| + \|new\|) set ops + O(\|Δ\|) SQL |
| Inserts | `INSERT OR IGNORE` — safe on retry |
| Delete order | Before insert not required; FK CASCADE on catalog delete |
| Sort `added`/`removed` | Deterministic tests (`sorted(keys)`) |

---

## 4. Worked example: `tagged_knowledge_base.json`

**File:** `examples/tagged_knowledge_base.json`

Minimal local-only package:

| Entity | Primitive | Table |
|--------|-----------|-------|
| Notebook | container | `notebooks` |
| Note | primary_row | `notes` |
| Reference | catalog_entry | `references` |
| Tag | catalog_entry | `tags` |

### 4.1 Generated DDL (from package)

```sql
CREATE TABLE IF NOT EXISTS notebooks (
  id   TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  updated TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notes (
  notebook_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  references TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  PRIMARY KEY (notebook_id, id),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS references (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reference_tags (
  reference_id TEXT NOT NULL,
  notebook_id TEXT NOT NULL,
  note_id INTEGER NOT NULL,
  PRIMARY KEY (reference_id, notebook_id, note_id),
  FOREIGN KEY (reference_id) REFERENCES references(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_tags (
  tag_id TEXT NOT NULL,
  notebook_id TEXT NOT NULL,
  note_id INTEGER NOT NULL,
  PRIMARY KEY (tag_id, notebook_id, note_id),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### 4.2 Example interaction trace

**Initial state** (from `seed`):

```
notebooks: [{ id: "main", title: "Main Notebook" }]
notes: [{ notebook_id: "main", id: 1, title: "Getting started", status: "active" }]
tags: [{ id: "tag-ideas", name: "Ideas" }]
note_tags: [{ tag_id: "tag-ideas", notebook_id: "main", note_id: 1 }]
references: []
```

**User tags reference `ref-1` to note 1** (tag modal):

```
PUT /api/references/ref-1/tags
  body: { tags: [{ notebook_id: "main", note_id: 1 }] }

→ INSERT reference_tags (ref-1, main, 1)
→ notes.references += "API Design Guide — https://example.com/api (Article)"
```

**User edits note.references inline** (autosave PATCH):

```
PATCH /api/notes/1?notebook_id=main
  body: { references: "API Design Guide — https://example.com/api (Article)\nSpec — https://example.com/spec" }

→ sync_projection_field_to_catalog:
    upsert references by URL
    INSERT reference_tags for spec if new
```

**User adds tag via theme modal** (junction only):

```
PUT /api/notes/1/tags?notebook_id=main
  body: { tag_ids: ["tag-ideas", "tag-research"] }

→ INSERT note_tags for tag-research
→ notes row unchanged; GET /api/notes returns themes: ["Ideas", "Research"]
```

### 4.3 Export output (JSON zip)

`data/main.json`:

```json
{
  "id": "main",
  "title": "Main Notebook",
  "updated": "2026-07-16",
  "notes": [
    {
      "id": 1,
      "title": "Getting started",
      "body": "Use Tag catalog to link references\u001eUse Edit tags for clusters",
      "references": "API Design Guide — https://example.com/api (Article)",
      "status": "active",
      "tags": ["Ideas", "Research"]
    }
  ]
}
```

### 4.4 API surface (minimal package)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/schema` | Return active package |
| GET | `/api/notes?notebook_id=main` | List with joined tags |
| PATCH | `/api/notes/{id}?notebook_id=main` | Row save + projection sync |
| PUT | `/api/references/{id}/tags` | Junction diff + projection |
| PUT | `/api/notes/{id}/tags?notebook_id=main` | Junction only |
| GET | `/api/export/json.zip` | Per `export_profiles.json` |
| GET | `/api/export/xlsx` | Sheets: Notes, References, Tags |

---

## 5. Implementation checklist

- [ ] `kit/engine/ddl.py` — emit CREATE TABLE from §1
- [ ] `kit/engine/serialize.py` — bullet_list, json_array
- [ ] `kit/engine/projection.py` — §2 helpers
- [ ] `kit/engine/junction.py` — §3 `set_tags`
- [ ] Unit tests: projection round-trip, junction idempotency, parse edge cases
- [ ] Load `examples/tagged_knowledge_base.json` as default dev package

---

## Appendix A — Format-sensitive test cases

| Input line | `parse_projection_line` result |
|------------|-------------------------------|
| `Title — https://x.com` | `("Title", "https://x.com")` |
| `https://x.com` | `("", "https://x.com")` |
| `Title — https://x.com (Article)` | label + url + meta preserved in rest |
| Empty line | skipped in sync |

| Bullet storage | Round-trip |
|----------------|------------|
| `a\x1eb` | `["a","b"]` |
| `a\nb` (legacy) | `["a","b"]` on read |

---

## Appendix B — File index

```
dynamic-database-builder/
├── TECHNICAL_SPEC.md                    ← this file
├── examples/tagged_knowledge_base.json  ← worked package (§4)
├── BUILD_PLAN.md
├── GENERALIZED_SUMMARY.md
└── site.schema.json
```
