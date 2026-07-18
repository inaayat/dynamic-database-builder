"""Generic CRUD operations driven by schema."""

from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Optional

from kit.engine.junction import enrich_row_links
from kit.engine.projection import sync_projection_field_to_catalog
from kit.engine.sql import q
from kit.engine.serialize import row_from_api, row_to_api
from kit.schema.model import EntityType, SitePackage


def _conventions(package: SitePackage) -> Optional[dict]:
    if package.format_conventions:
        return package.format_conventions.model_dump()
    return None


def list_rows(
    conn,
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
        enrich_row_links(conn, package, entity_id, item, container_id)
        result.append(item)
    return result


def get_row(
    conn,
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
    enrich_row_links(conn, package, entity_id, item, container_id)
    return item


def patch_row(
    conn,
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

    if container_id and "references" in allowed:
        for rel in package.relationships:
            if (
                rel.projection
                and rel.projection.enabled
                and rel.projection.target_entity == entity_id
                and rel.projection.target_field in allowed
            ):
                sync_projection_field_to_catalog(conn, package, rel, container_id, int(row_id))
                break

    conn.commit()
    return get_row(conn, package, entity_id, row_id, container_id)


def create_row(
    conn,
    package: SitePackage,
    entity_id: str,
    data: dict,
    container_id: Optional[str] = None,
) -> dict:
    entity = package.get_entity(entity_id)
    table = q(entity.table)

    if entity_id == "reference" and not data.get("id"):
        data["id"] = f"ref-{uuid.uuid4().hex[:8]}"
    if entity_id == "tag" and not data.get("id"):
        data["id"] = f"tag-{uuid.uuid4().hex[:8]}"
    if entity.primitive == "container" and not data.get("id"):
        raw = (data.get("title") or entity.label or "workspace").lower()
        base = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")[:40] or "workspace"
        candidate = base
        n = 2
        while conn.execute(
            f"SELECT 1 FROM {table} WHERE id = ?", (candidate,)
        ).fetchone():
            candidate = f"{base}_{n}"
            n += 1
        data["id"] = candidate
    if entity.primitive == "container" and "updated" in entity.fields and not data.get("updated"):
        data["updated"] = date.today().isoformat()
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
    conn,
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
