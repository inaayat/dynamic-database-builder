"""Generic CRUD operations driven by schema."""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from kit.engine.junction import get_tag_names_for_note
from kit.engine.projection import sync_projection_field_to_catalog
from kit.engine.sql import q
from kit.engine.serialize import row_from_api, row_to_api
from kit.schema.model import EntityType, SitePackage


def _conventions(package: SitePackage) -> Optional[dict]:
    if package.format_conventions:
        return package.format_conventions.model_dump()
    return None


def list_rows(
    conn: sqlite3.Connection,
    package: SitePackage,
    entity_id: str,
    container_id: Optional[str] = None,
) -> list[dict]:
    entity = package.get_entity(entity_id)
    table = q(entity.table)
    if container_id and entity.primitive == "primary_row":
        rows = conn.execute(
            f"SELECT * FROM {table} WHERE notebook_id = ? ORDER BY id",
            (container_id,),
        ).fetchall()
    else:
        order = "name" if entity_id == "tag" else "id"
        rows = conn.execute(f"SELECT * FROM {table} ORDER BY {order}").fetchall()

    conv = _conventions(package)
    result = []
    for r in rows:
        item = row_to_api(entity.fields, dict(r), conv)
        if entity_id == "note" and container_id:
            item["tags"] = get_tag_names_for_note(conn, container_id, item["id"])
        result.append(item)
    return result


def get_row(
    conn: sqlite3.Connection,
    package: SitePackage,
    entity_id: str,
    row_id: Any,
    container_id: Optional[str] = None,
) -> Optional[dict]:
    entity = package.get_entity(entity_id)
    table = q(entity.table)
    if container_id and entity.primitive == "primary_row":
        row = conn.execute(
            f"SELECT * FROM {table} WHERE notebook_id = ? AND id = ?",
            (container_id, row_id),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT * FROM {table} WHERE id = ?",
            (row_id,),
        ).fetchone()
    if not row:
        return None
    item = row_to_api(entity.fields, dict(row), _conventions(package))
    if entity_id == "note" and container_id:
        item["tags"] = get_tag_names_for_note(conn, container_id, item["id"])
    return item


def patch_row(
    conn: sqlite3.Connection,
    package: SitePackage,
    entity_id: str,
    row_id: Any,
    fields: dict,
    container_id: Optional[str] = None,
) -> Optional[dict]:
    entity = package.get_entity(entity_id)
    table = q(entity.table)
    allowed = {k: v for k, v in fields.items() if k in entity.fields and k not in ("id", "notebook_id")}
    if not allowed:
        return get_row(conn, package, entity_id, row_id, container_id)

    serialized = row_from_api(entity.fields, allowed, _conventions(package))
    set_clause = ", ".join(f"{q(k)} = ?" for k in serialized)
    values = list(serialized.values())

    if container_id and entity.primitive == "primary_row":
        values.extend([container_id, row_id])
        conn.execute(
            f"UPDATE {table} SET {set_clause} WHERE notebook_id = ? AND id = ?",
            values,
        )
    else:
        values.append(row_id)
        conn.execute(
            f"UPDATE {table} SET {set_clause} WHERE id = ?",
            values,
        )

    if entity_id == "note" and container_id and "references" in allowed:
        rel = next((r for r in package.relationships if r.id == "reference_tags_note"), None)
        if rel and rel.projection and rel.projection.enabled:
            sync_projection_field_to_catalog(conn, package, rel, container_id, int(row_id))

    conn.commit()
    return get_row(conn, package, entity_id, row_id, container_id)


def create_row(
    conn: sqlite3.Connection,
    package: SitePackage,
    entity_id: str,
    data: dict,
    container_id: Optional[str] = None,
) -> dict:
    entity = package.get_entity(entity_id)
    table = q(entity.table)
    import uuid

    if entity_id == "reference" and not data.get("id"):
        data["id"] = f"ref-{uuid.uuid4().hex[:8]}"
    if entity_id == "tag" and not data.get("id"):
        data["id"] = f"tag-{uuid.uuid4().hex[:8]}"
    if entity_id == "note" and container_id:
        data["notebook_id"] = container_id
        if not data.get("id"):
            row = conn.execute(
                "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM notes WHERE notebook_id = ?",
                (container_id,),
            ).fetchone()
            data["id"] = row["next_id"]

    serialized = row_from_api(entity.fields, data, _conventions(package))
    cols = list(serialized.keys())
    placeholders = ", ".join("?" * len(cols))
    conn.execute(
        f"INSERT INTO {table} ({', '.join(q(c) for c in cols)}) VALUES ({placeholders})",
        [serialized[c] for c in cols],
    )
    conn.commit()
    pk = data["id"]
    return get_row(conn, package, entity_id, pk, container_id)


def delete_row(
    conn: sqlite3.Connection,
    package: SitePackage,
    entity_id: str,
    row_id: Any,
    container_id: Optional[str] = None,
) -> bool:
    entity = package.get_entity(entity_id)
    table = q(entity.table)
    if container_id and entity.primitive == "primary_row":
        cur = conn.execute(
            f"DELETE FROM {table} WHERE notebook_id = ? AND id = ?",
            (container_id, row_id),
        )
    else:
        cur = conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
    conn.commit()
    return cur.rowcount > 0
