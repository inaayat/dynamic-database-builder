# Dynamic Database Builder

A **schema-driven, local-first platform** for building knowledge and planning apps without hand-editing Python, SQL, and HTML per site. Users configure entities, fields, connections, views, actions, and exports through a visual **Design** tab — the runtime interprets `site.schema.json` and provisions SQLite + FastAPI + a single-page editor.

## What this repo is (today)

Planning artifacts and schema specifications for the tooling build. No runtime code yet.

| Document | Purpose |
|----------|---------|
| [BUILD_PLAN.md](./BUILD_PLAN.md) | Phased implementation plan (foundation → notes KB → Design tab → mind map) |
| [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) | Field→SQLite mapping, projection sync, junction diff algorithms |
| [GENERALIZED_SUMMARY.md](./GENERALIZED_SUMMARY.md) | Conceptual model: primitives, storage patterns, Connection Builder UI |
| [KNOWLEDGE_SITE_TEMPLATE.md](./KNOWLEDGE_SITE_TEMPLATE.md) | Architecture guide — entities, relationships, views |
| [CONTINUATION_PROMPT.md](./CONTINUATION_PROMPT.md) | Paste-into-chat handoff for resuming sessions |
| [site.schema.json](./site.schema.json) | Machine-readable schema v1 (entities, relationships, template packages) |
| [examples/tagged_knowledge_base.json](./examples/tagged_knowledge_base.json) | Minimal worked package for notes KB |
| [examples/mind-map.schema.json](./examples/mind-map.schema.json) | Graph canvas extension example |

## Product vision

**Live SQLite + schema-driven REST API + single-page editor + optional JSON/XLSX export** — relationships declared as reusable primitives, not invented per project.

## Phased delivery

| Phase | Focus | Duration |
|-------|-------|----------|
| **0** | Foundation — schema loader, `GET /api/schema`, editor shell | 1–2 wk |
| **1** | Notes KB — dynamic DDL, projection, grid + catalog views, export | 2–3 wk |
| **2** | Design tab — Connection Builder UI | 2–3 wk |
| **3** | Mind map — Cytoscape graph view, node links | 3–4 wk |
| **4** | Parity — aggregate/hierarchy views, `audit_compliance` package | 2 wk |
| **5** | Codegen & polish — `new_site.py`, tests | 1–2 wk |

See [BUILD_PLAN.md](./BUILD_PLAN.md) for deliverables and sprint checklists.  
See [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) before implementing Phase 0–1.

## First sprint (Week 1)

1. `kit/schema/model.py` — Pydantic models for schema v1.1
2. Load `examples/tagged_knowledge_base.json` as default package
3. `GET /api/schema` + `editor.html` with Edit/Design tab placeholders
4. Spike: dynamic `notes` table + `PATCH /api/notes/{id}`

## License

TBD
