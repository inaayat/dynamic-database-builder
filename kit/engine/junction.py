"""Junction table membership updates."""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from kit.engine.projection import append_projection_line, remove_projection_line
from kit.engine.sql import q
from kit.schema.model import Relationship, SitePackage


def _tag_key(ref: dict, junction_keys: list[str], from_col: str) -> tuple:
    return tuple(ref[k] for k in junction_keys if k != from_col)


def get_junction_refs(conn: sqlite3.Connection, table: str, from_col: str, from_id: str) -> list[dict]:
    rows = conn.execute(
        f"SELECT * FROM {table} WHERE {from_col} = ?",
        (from_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def set_tags(
    conn: sqlite3.Connection,
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
    conn: sqlite3.Connection,
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


def get_tag_names_for_note(conn: sqlite3.Connection, notebook_id: str, note_id: int) -> list[str]:
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
