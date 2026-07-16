"""Generate SQLite DDL from schema package."""

from __future__ import annotations

import sqlite3

from kit.schema.model import EntityType, Relationship, SitePackage

from kit.engine.sql import q


def _pk_columns(entity: EntityType) -> list[str]:
    pk = entity.primary_key
    if isinstance(pk, str):
        return [pk]
    return list(pk)


def _column_sql(name: str, field_def: dict, pk_cols: list[str]) -> str:
    sqlite = field_def.get("sqlite", {})
    col_type = sqlite.get("column", "TEXT")
    parts = [q(name), col_type]
    if name in pk_cols and len(pk_cols) == 1:
        parts.append("NOT NULL")
    elif sqlite.get("nullable") is False:
        parts.append("NOT NULL")
    if "default" in sqlite:
        parts.append(f"DEFAULT {sqlite['default']}")
    if sqlite.get("unique"):
        parts.append("UNIQUE")
    return " ".join(parts)


def create_entity_table_sql(entity: EntityType) -> str:
    pk_cols = _pk_columns(entity)
    col_lines = [_column_sql(n, f, pk_cols) for n, f in entity.fields.items()]
    if len(pk_cols) == 1:
        pass  # single PK already on column
    else:
        col_lines.append(f"PRIMARY KEY ({', '.join(q(c) for c in pk_cols)})")
    return f"CREATE TABLE IF NOT EXISTS {q(entity.table)} (\n  " + ",\n  ".join(col_lines) + "\n)"


def create_junction_table_sql(rel: Relationship) -> str:
    if not rel.junction:
        return ""
    keys = rel.junction.keys
    col_lines = [f"{k} TEXT NOT NULL" if "id" in k and k != "note_id" else f"{k} {'INTEGER' if k == 'note_id' else 'TEXT'} NOT NULL" for k in keys]
    # note_id is INTEGER, others TEXT for this package
    col_lines = []
    for k in keys:
        col_type = "INTEGER" if k == "note_id" else "TEXT"
        col_lines.append(f"{q(k)} {col_type} NOT NULL")
    col_lines.append(f"PRIMARY KEY ({', '.join(q(k) for k in keys)})")
    return f"CREATE TABLE IF NOT EXISTS {q(rel.junction.table)} (\n  " + ",\n  ".join(col_lines) + "\n)"


def apply_schema_ddl(conn: sqlite3.Connection, package: SitePackage) -> None:
    for entity in package.entity_types.values():
        conn.execute(create_entity_table_sql(entity))
    for rel in package.relationships:
        if rel.storage == "junction" and rel.junction:
            conn.execute(create_junction_table_sql(rel))
    conn.commit()
