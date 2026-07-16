"""Seed database from schema package seed block."""

from __future__ import annotations

import sqlite3

from kit.engine.junction import set_note_tags
from kit.engine.serialize import serialize_field
from kit.schema.model import SitePackage


def needs_seed(conn: sqlite3.Connection, package: SitePackage) -> bool:
    notebook = package.get_entity("notebook")
    row = conn.execute(f"SELECT COUNT(*) AS c FROM {notebook.table}").fetchone()
    return row["c"] == 0


def apply_seed(conn: sqlite3.Connection, package: SitePackage) -> None:
    if not package.seed or not needs_seed(conn, package):
        return

    seed = package.seed
    conv = package.format_conventions.model_dump() if package.format_conventions else None
    note_fields = package.get_entity("note").fields
    tag_fields = package.get_entity("tag").fields

    tag_name_to_id: dict[str, str] = {}
    for tag in seed.get("tags", []):
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, description) VALUES (?, ?, ?)",
            (tag["id"], tag["name"], tag.get("description", "")),
        )
        tag_name_to_id[tag["name"]] = tag["id"]

    for nb in seed.get("notebooks", []):
        conn.execute(
            "INSERT INTO notebooks (id, title, updated) VALUES (?, ?, ?)",
            (nb["id"], nb["title"], ""),
        )
        for note in nb.get("notes", []):
            body = serialize_field(note_fields["body"], note.get("body", []), conv)
            conn.execute(
                "INSERT INTO notes (notebook_id, id, title, body, \"references\", status) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    nb["id"],
                    note["id"],
                    note.get("title", ""),
                    body,
                    note.get("references", ""),
                    note.get("status", "draft"),
                ),
            )
            tag_ids = [tag_name_to_id[n] for n in note.get("tags", []) if n in tag_name_to_id]
            if tag_ids:
                set_note_tags(conn, package, nb["id"], note["id"], tag_ids)

    conn.commit()
