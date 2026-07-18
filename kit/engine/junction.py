"""Junction table membership updates."""

from __future__ import annotations

from typing import Any, Optional

from kit.engine.projection import append_projection_line, remove_projection_line
from kit.engine.sql import q
from kit.schema.model import Relationship, SitePackage


def _tag_key(ref: dict, junction_keys: list[str], from_col: str) -> tuple:
    return tuple(ref[k] for k in junction_keys if k != from_col)


def junction_perspective(rel: Relationship, entity_id: str) -> tuple[str, str, str]:
    """Return anchor_col, linked_col, linked_entity_id from entity_id's side."""
    if entity_id == rel.to:
        return f"{rel.to}_id", f"{rel.from_}_id", rel.from_
    if entity_id == rel.from_:
        return f"{rel.from_}_id", f"{rel.to}_id", rel.to
    raise ValueError(f"Entity {entity_id!r} not in relationship {rel.id!r}")


def is_simple_chip_junction(rel: Relationship, entity_id: str) -> bool:
    """M:N junction editable via a list of linked row ids (+ optional notebook scope)."""
    if rel.storage != "junction" or not rel.junction:
        return False
    if entity_id not in (rel.from_, rel.to):
        return False
    keys = set(rel.junction.keys)
    id_keys = {f"{rel.from_}_id", f"{rel.to}_id"}
    return keys <= id_keys | {"notebook_id"}


def _scope_values(rel: Relationship, container_id: Optional[str]) -> dict[str, Any]:
    scope: dict[str, Any] = {}
    if container_id and rel.junction and "notebook_id" in rel.junction.keys:
        scope["notebook_id"] = container_id
    return scope


def _display_field(entity_fields: dict[str, dict]) -> str:
    for fname in ("name", "title"):
        if fname in entity_fields:
            return fname
    for fname, fdef in entity_fields.items():
        if fname in ("id", "notebook_id"):
            continue
        if fdef.get("type") in ("text", "enum", "url"):
            return fname
    return "id"


def get_junction_refs(conn, table: str, from_col: str, from_id: str) -> list[dict]:
    rows = conn.execute(
        f"SELECT * FROM {table} WHERE {from_col} = ?",
        (from_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_linked_ids(
    conn,
    package: SitePackage,
    relationship_id: str,
    entity_id: str,
    row_id: Any,
    container_id: Optional[str] = None,
) -> list[Any]:
    rel = next(r for r in package.relationships if r.id == relationship_id)
    if not rel.junction:
        raise ValueError(f"Relationship {relationship_id} has no junction")
    anchor_col, linked_col, _ = junction_perspective(rel, entity_id)
    table = q(rel.junction.table)
    conds = [f"{anchor_col} = ?"]
    vals: list[Any] = [row_id]
    for key, value in _scope_values(rel, container_id).items():
        conds.append(f"{key} = ?")
        vals.append(value)
    rows = conn.execute(
        f"SELECT {linked_col} FROM {table} WHERE {' AND '.join(conds)}",
        vals,
    ).fetchall()
    return [r[linked_col] for r in rows]


def get_linked_labels(
    conn,
    package: SitePackage,
    relationship_id: str,
    entity_id: str,
    row_id: Any,
    container_id: Optional[str] = None,
) -> list[str]:
    rel = next(r for r in package.relationships if r.id == relationship_id)
    _, _, linked_entity_id = junction_perspective(rel, entity_id)
    linked_ids = get_linked_ids(conn, package, relationship_id, entity_id, row_id, container_id)
    if not linked_ids:
        return []
    linked_entity = package.get_entity(linked_entity_id)
    field = _display_field(linked_entity.fields)
    table = q(linked_entity.table)
    labels: list[str] = []
    for lid in linked_ids:
        row = conn.execute(
            f"SELECT {q(field)} FROM {table} WHERE id = ?",
            (lid,),
        ).fetchone()
        if row:
            labels.append(str(row[field]))
    return labels


def set_linked_ids(
    conn,
    package: SitePackage,
    relationship_id: str,
    entity_id: str,
    row_id: Any,
    linked_ids: list[Any],
    container_id: Optional[str] = None,
) -> None:
    rel = next(r for r in package.relationships if r.id == relationship_id)
    if not rel.junction:
        raise ValueError(f"Relationship {relationship_id} has no junction")
    if not is_simple_chip_junction(rel, entity_id):
        raise ValueError(f"Relationship {relationship_id} is not a simple chip junction")

    table = q(rel.junction.table)
    keys = rel.junction.keys
    anchor_col, linked_col, _ = junction_perspective(rel, entity_id)
    scope = _scope_values(rel, container_id)

    conds = [f"{anchor_col} = ?"]
    vals: list[Any] = [row_id]
    for key, value in scope.items():
        conds.append(f"{key} = ?")
        vals.append(value)

    old_rows = conn.execute(
        f"SELECT {linked_col} FROM {table} WHERE {' AND '.join(conds)}",
        vals,
    ).fetchall()
    old_ids = {r[linked_col] for r in old_rows}
    new_ids = set(linked_ids)

    catalog_row = None
    if rel.projection and rel.projection.enabled and entity_id == rel.from_:
        ent = package.get_entity(entity_id)
        row = conn.execute(
            f"SELECT * FROM {q(ent.table)} WHERE id = ?",
            (row_id,),
        ).fetchone()
        if row:
            catalog_row = dict(row)

    for lid in sorted(new_ids - old_ids, key=str):
        row_data = {anchor_col: row_id, linked_col: lid, **scope}
        insert_vals = [row_data[k] for k in keys]
        placeholders = ", ".join("?" * len(keys))
        conn.execute(
            f"INSERT OR IGNORE INTO {table} ({', '.join(keys)}) VALUES ({placeholders})",
            insert_vals,
        )
        if rel.projection and rel.projection.enabled and catalog_row:
            target_ref = {**scope, linked_col: lid}
            if anchor_col not in target_ref:
                target_ref[anchor_col] = row_id
            append_projection_line(conn, package, rel, target_ref, catalog_row)

    for lid in sorted(old_ids - new_ids, key=str):
        delete_conds = [f"{anchor_col} = ?", f"{linked_col} = ?"]
        delete_vals: list[Any] = [row_id, lid]
        for key, value in scope.items():
            delete_conds.append(f"{key} = ?")
            delete_vals.append(value)
        conn.execute(
            f"DELETE FROM {table} WHERE {' AND '.join(delete_conds)}",
            delete_vals,
        )
        if rel.projection and rel.projection.enabled and catalog_row:
            target_ref = {**scope, linked_col: lid}
            if anchor_col not in target_ref:
                target_ref[anchor_col] = row_id
            remove_projection_line(conn, package, rel, target_ref, catalog_row)

    conn.commit()


def enrich_row_links(
    conn,
    package: SitePackage,
    entity_id: str,
    row: dict,
    container_id: Optional[str] = None,
) -> None:
    links: dict[str, dict[str, list]] = {}
    row_id = row.get("id")
    if row_id is None:
        return
    for rel in package.relationships:
        if not is_simple_chip_junction(rel, entity_id):
            continue
        try:
            ids = get_linked_ids(conn, package, rel.id, entity_id, row_id, container_id)
            names = get_linked_labels(conn, package, rel.id, entity_id, row_id, container_id)
        except (ValueError, KeyError):
            continue
        links[rel.id] = {"ids": ids, "names": names}
    if links:
        row["_links"] = links


def set_tags(
    conn,
    package: SitePackage,
    relationship_id: str,
    from_id: str,
    new_refs: list[dict],
    catalog_row: Optional[dict] = None,
) -> None:
    rel = next(r for r in package.relationships if r.id == relationship_id)
    if not rel.junction:
        raise ValueError(f"Relationship {relationship_id} has no junction")

    table = q(rel.junction.table)
    keys = rel.junction.keys
    from_col = f"{rel.from_}_id"

    if catalog_row is None:
        entity = package.get_entity(rel.from_)
        row = conn.execute(
            f"SELECT * FROM {q(entity.table)} WHERE id = ?",
            (from_id,),
        ).fetchone()
        if not row:
            raise KeyError(from_id)
        catalog_row = dict(row)

    old_refs = get_junction_refs(conn, table, from_col, from_id)
    old_map = {_tag_key(r, keys, from_col): r for r in old_refs}
    new_map = {_tag_key(r, keys, from_col): r for r in new_refs}

    added = set(new_map.keys()) - set(old_map.keys())
    removed = set(old_map.keys()) - set(new_map.keys())

    for key in sorted(added):
        ref = new_map[key]
        row_data = {from_col: from_id}
        for k in keys:
            if k != from_col:
                row_data[k] = ref[k]
        vals = [row_data[k] for k in keys]
        placeholders = ", ".join("?" * len(keys))
        conn.execute(
            f"INSERT OR IGNORE INTO {table} ({', '.join(keys)}) VALUES ({placeholders})",
            vals,
        )
        if rel.projection and rel.projection.enabled:
            append_projection_line(conn, package, rel, ref, catalog_row)

    for key in sorted(removed):
        ref = old_map[key]
        conditions = " AND ".join(f"{k} = ?" for k in keys)
        vals = [ref[k] for k in keys]
        conn.execute(f"DELETE FROM {table} WHERE {conditions}", vals)
        if rel.projection and rel.projection.enabled:
            remove_projection_line(conn, package, rel, ref, catalog_row)

    conn.commit()


def set_note_tags(
    conn,
    package: SitePackage,
    notebook_id: str,
    note_id: int,
    tag_ids: list[str],
) -> None:
    rel = next(r for r in package.relationships if r.id == "tag_tags_note")
    table = rel.junction.table
    old = conn.execute(
        f"SELECT tag_id FROM {table} WHERE notebook_id = ? AND note_id = ?",
        (notebook_id, note_id),
    ).fetchall()
    old_ids = {r["tag_id"] for r in old}
    new_ids = set(tag_ids)

    for tid in new_ids - old_ids:
        conn.execute(
            f"INSERT OR IGNORE INTO {table} (tag_id, notebook_id, note_id) VALUES (?, ?, ?)",
            (tid, notebook_id, note_id),
        )
    for tid in old_ids - new_ids:
        conn.execute(
            f"DELETE FROM {table} WHERE tag_id = ? AND notebook_id = ? AND note_id = ?",
            (tid, notebook_id, note_id),
        )
    conn.commit()


def get_tag_names_for_note(conn, notebook_id: str, note_id: int) -> list[str]:
    rows = conn.execute(
        """
        SELECT t.name FROM note_tags nt
        JOIN tags t ON t.id = nt.tag_id
        WHERE nt.notebook_id = ? AND nt.note_id = ?
        ORDER BY t.name
        """,
        (notebook_id, note_id),
    ).fetchall()
    return [r["name"] for r in rows]
