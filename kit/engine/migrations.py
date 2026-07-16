"""Schema migration diff and additive apply."""

from __future__ import annotations

import copy
import sqlite3
from typing import Any, Optional

from kit.engine.ddl import create_entity_table_sql, create_junction_table_sql
from kit.engine.sql import q
from kit.schema.model import SitePackage


SYSTEM_TABLES = {"_meta", "sqlite_sequence"}


def list_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    return {row[0] for row in rows}


def list_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({q(table)})").fetchall()
    return {row[1] for row in rows}


def expected_tables(package: SitePackage) -> dict[str, Optional[str]]:
    """Map table name → entity id (None for junction-only tables)."""
    tables: dict[str, Optional[str]] = {}
    for entity_id, entity in package.entity_types.items():
        tables[entity.table] = entity_id
    for rel in package.relationships:
        if rel.storage == "junction" and rel.junction:
            tables[rel.junction.table] = None
    return tables


def diff_schema(conn: sqlite3.Connection, package: SitePackage) -> dict[str, Any]:
    """Compare live DB against schema; additive + destructive preview."""
    existing = list_tables(conn)
    expected = expected_tables(package)

    new_tables: list[str] = []
    new_columns: list[dict[str, str]] = []
    removed_tables: list[str] = []
    removed_columns: list[dict[str, str]] = []
    warnings: list[str] = []

    for table, entity_id in expected.items():
        if table not in existing:
            new_tables.append(table)
            continue
        if entity_id is None:
            continue
        entity = package.get_entity(entity_id)
        cols = list_columns(conn, table)
        for field_name in entity.fields:
            if field_name not in cols:
                new_columns.append(
                    {"table": table, "column": field_name, "entity": entity_id}
                )

    allowed = set(expected.keys()) | SYSTEM_TABLES
    for table in sorted(existing - allowed):
        removed_tables.append(table)
        warnings.append(f"Table {table!r} exists in DB but not in schema")

    for entity_id, entity in package.entity_types.items():
        if entity.table not in existing:
            continue
        cols = list_columns(conn, entity.table)
        schema_cols = set(entity.fields.keys())
        for col in sorted(cols - schema_cols):
            if col in SYSTEM_TABLES:
                continue
            removed_columns.append(
                {"table": entity.table, "column": col, "entity": entity_id}
            )

    destructive = bool(removed_tables or removed_columns)
    if removed_columns:
        warnings.append(
            f"{len(removed_columns)} column(s) would be dropped — export backup first"
        )

    return {
        "new_tables": new_tables,
        "new_columns": new_columns,
        "removed_tables": removed_tables,
        "removed_columns": removed_columns,
        "destructive": destructive,
        "warnings": warnings,
    }


def _alter_add_column_sql(table: str, field_name: str, field_def: dict) -> str:
    sqlite = field_def.get("sqlite", {})
    col_type = sqlite.get("column", "TEXT")
    parts = [f"ALTER TABLE {q(table)} ADD COLUMN {q(field_name)} {col_type}"]
    if sqlite.get("nullable") is False:
        parts.append("NOT NULL")
    if "default" in sqlite:
        parts.append(f"DEFAULT {sqlite['default']}")
    return " ".join(parts)


def apply_migrations(
    conn: sqlite3.Connection,
    package: SitePackage,
    diff: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Apply additive migrations only. Raises if diff is destructive."""
    preview = diff or diff_schema(conn, package)
    if preview.get("destructive"):
        raise ValueError(
            "Destructive schema changes detected — export a backup before applying"
        )

    applied: dict[str, Any] = {"tables": [], "columns": []}

    for table in preview["new_tables"]:
        entity_id = expected_tables(package).get(table)
        if entity_id:
            entity = package.get_entity(entity_id)
            conn.execute(create_entity_table_sql(entity))
            applied["tables"].append(table)
        else:
            for rel in package.relationships:
                if rel.junction and rel.junction.table == table:
                    conn.execute(create_junction_table_sql(rel))
                    applied["tables"].append(table)
                    break

    entity_by_table = {e.table: e for e in package.entity_types.values()}
    for col_info in preview["new_columns"]:
        table = col_info["table"]
        entity = entity_by_table.get(table)
        if not entity:
            continue
        field_name = col_info["column"]
        field_def = entity.fields.get(field_name)
        if not field_def:
            continue
        if field_name in list_columns(conn, table):
            continue
        conn.execute(_alter_add_column_sql(table, field_name, field_def))
        applied["columns"].append(col_info)

    conn.commit()
    return applied
