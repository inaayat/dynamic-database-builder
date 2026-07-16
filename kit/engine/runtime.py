"""Application runtime — DB connection, schema, bootstrap."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from kit.engine.crud import create_row, delete_row, get_row, list_rows, patch_row
from kit.engine.db import connect, get_db_path, init_meta
from kit.engine.ddl import apply_schema_ddl
from kit.engine.junction import get_junction_refs, set_note_tags, set_tags
from kit.engine.seed import apply_seed
from kit.schema.model import SitePackage


class Runtime:
    def __init__(self, package: SitePackage, root: Path) -> None:
        self.package = package
        self.root = root
        self.db_path = get_db_path(package, root)
        self.conn = connect(self.db_path)
        self.bootstrap()

    def bootstrap(self) -> None:
        init_meta(self.conn, self.package)
        apply_schema_ddl(self.conn, self.package)
        apply_seed(self.conn, self.package)

    def close(self) -> None:
        self.conn.close()

    # CRUD delegates
    def list_rows(self, entity_id: str, container_id: Optional[str] = None) -> list[dict]:
        return list_rows(self.conn, self.package, entity_id, container_id)

    def get_row(self, entity_id: str, row_id, container_id: Optional[str] = None) -> Optional[dict]:
        return get_row(self.conn, self.package, entity_id, row_id, container_id)

    def patch_row(self, entity_id: str, row_id, fields: dict, container_id: Optional[str] = None) -> Optional[dict]:
        return patch_row(self.conn, self.package, entity_id, row_id, fields, container_id)

    def create_row(self, entity_id: str, data: dict, container_id: Optional[str] = None) -> dict:
        return create_row(self.conn, self.package, entity_id, data, container_id)

    def delete_row(self, entity_id: str, row_id, container_id: Optional[str] = None) -> bool:
        return delete_row(self.conn, self.package, entity_id, row_id, container_id)

    def set_reference_tags(self, reference_id: str, tags: list[dict]) -> dict:
        set_tags(self.conn, self.package, "reference_tags_note", reference_id, tags)
        return self.get_row("reference", reference_id)

    def set_note_tags(self, notebook_id: str, note_id: int, tag_ids: list[str]) -> dict:
        set_note_tags(self.conn, self.package, notebook_id, note_id, tag_ids)
        return self.get_row("note", note_id, notebook_id)

    def get_reference_tags(self, reference_id: str) -> list[dict]:
        refs = get_junction_refs(self.conn, "reference_tags", "reference_id", reference_id)
        return [{"notebook_id": r["notebook_id"], "note_id": r["note_id"]} for r in refs]
