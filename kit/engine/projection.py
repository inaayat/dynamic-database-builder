"""Projection sync between junction tables and multiline text fields."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from kit.engine.serialize import (
    extract_url,
    format_projection_line,
    line_matches_catalog,
    normalize_url,
    parse_projection_line,
)
from kit.engine.sql import q
from kit.schema.model import Relationship, SitePackage


def append_projection_line(
    conn,
    package: SitePackage,
    rel: Relationship,
    target_ref: dict,
    catalog_row: dict,
) -> None:
    if not rel.projection or not rel.projection.enabled:
        return
    entity = package.get_entity(rel.projection.target_entity)
    field = rel.projection.target_field
    notebook_id = target_ref.get("notebook_id")
    note_id = target_ref.get("note_id")
    table = q(entity.table)
    row = conn.execute(
        f"SELECT * FROM {table} WHERE notebook_id = ? AND id = ?",
        (notebook_id, note_id),
    ).fetchone()
    if not row:
        return
    row = dict(row)
    line = format_projection_line(
        catalog_row,
        rel.projection.line_format or "{title} — {link}",
        rel.projection.optional_meta_format,
    )
    existing = (row.get(field) or "").split("\n")
    for ex in existing:
        if line_matches_catalog(catalog_row, ex, rel.projection.line_format or "{title} — {link}", rel.projection.optional_meta_format):
            return
    text = row.get(field) or ""
    new_text = f"{text}\n{line}".strip() if text.strip() else line
    conn.execute(
        f"UPDATE {table} SET {q(field)} = ? WHERE notebook_id = ? AND id = ?",
        (new_text, notebook_id, note_id),
    )


def remove_projection_line(
    conn,
    package: SitePackage,
    rel: Relationship,
    target_ref: dict,
    catalog_row: dict,
) -> None:
    if not rel.projection or not rel.projection.enabled:
        return
    entity = package.get_entity(rel.projection.target_entity)
    field = rel.projection.target_field
    notebook_id = target_ref.get("notebook_id")
    note_id = target_ref.get("note_id")
    table = q(entity.table)
    row = conn.execute(
        f"SELECT * FROM {table} WHERE notebook_id = ? AND id = ?",
        (notebook_id, note_id),
    ).fetchone()
    if not row:
        return
    lines = [l for l in (dict(row).get(field) or "").split("\n") if l.strip()]
    line_format = rel.projection.line_format or "{title} — {link}"
    filtered = [
        l for l in lines
        if not line_matches_catalog(catalog_row, l, line_format, rel.projection.optional_meta_format)
    ]
    conn.execute(
        f"UPDATE {table} SET {q(field)} = ? WHERE notebook_id = ? AND id = ?",
        ("\n".join(filtered), notebook_id, note_id),
    )


def sync_projection_field_to_catalog(
    conn,
    package: SitePackage,
    rel: Relationship,
    notebook_id: str,
    note_id: int,
) -> None:
    if not rel.projection or not rel.projection.enabled:
        return
    entity = package.get_entity(rel.projection.target_entity)
    catalog_entity = package.get_entity(rel.from_)
    field = rel.projection.target_field
    table = q(entity.table)
    row = conn.execute(
        f"SELECT * FROM {table} WHERE notebook_id = ? AND id = ?",
        (notebook_id, note_id),
    ).fetchone()
    if not row:
        return
    text = dict(row).get(field) or ""
    seen: set[str] = set()

    for line in text.split("\n"):
        label, rest = parse_projection_line(line)
        url = extract_url(rest)
        if not url:
            continue
        key = normalize_url(url)
        if key in seen:
            continue
        seen.add(key)

        catalog_table = q(catalog_entity.table)
        existing = conn.execute(
            f"SELECT id FROM {catalog_table} WHERE lower(rtrim(link, '/')) = ?",
            (key,),
        ).fetchone()
        if existing:
            ref_id = existing["id"]
        else:
            ref_id = f"ref-{uuid.uuid4().hex[:8]}"
            conn.execute(
                f"INSERT INTO {catalog_table} (id, title, link, type, summary) VALUES (?, ?, ?, ?, ?)",
                (ref_id, label or url, url, "", ""),
            )

        conn.execute(
            f"INSERT OR IGNORE INTO {q(rel.junction.table)} (reference_id, notebook_id, note_id) VALUES (?, ?, ?)",
            (ref_id, notebook_id, note_id),
        )

    conn.commit()
