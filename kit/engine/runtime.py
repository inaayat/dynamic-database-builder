"""Application runtime — DB connection, schema, bootstrap."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional, TypeVar

from kit.engine.crud import create_row, delete_row, get_row, list_rows, patch_row
from kit.engine.db import connect, get_db_path, init_meta
from kit.engine.ddl import apply_schema_ddl
from kit.engine.junction import get_junction_refs, set_note_tags, set_tags
from kit.engine.seed import apply_seed
from kit.schema.model import SitePackage

T = TypeVar("T")


class Runtime:
    def __init__(self, package: SitePackage, root: Path) -> None:
        self.package = package
        self.root = root
        self.db_path = get_db_path(package, root)
        self.bootstrap()

    def bootstrap(self) -> None:
        conn = connect(self.db_path)
        try:
            init_meta(conn, self.package)
            apply_schema_ddl(conn, self.package)
            apply_seed(conn, self.package)
        finally:
            conn.close()

    def _with_conn(self, fn: Callable) -> T:
        conn = connect(self.db_path)
        try:
            return fn(conn)
        finally:
            conn.close()

    def list_rows(self, entity_id: str, container_id: Optional[str] = None) -> list[dict]:
        return self._with_conn(
            lambda c: list_rows(c, self.package, entity_id, container_id)
        )

    def get_row(self, entity_id: str, row_id, container_id: Optional[str] = None) -> Optional[dict]:
        return self._with_conn(
            lambda c: get_row(c, self.package, entity_id, row_id, container_id)
        )

    def patch_row(self, entity_id: str, row_id, fields: dict, container_id: Optional[str] = None) -> Optional[dict]:
        return self._with_conn(
            lambda c: patch_row(c, self.package, entity_id, row_id, fields, container_id)
        )

    def create_row(self, entity_id: str, data: dict, container_id: Optional[str] = None) -> dict:
        return self._with_conn(
            lambda c: create_row(c, self.package, entity_id, data, container_id)
        )

    def delete_row(self, entity_id: str, row_id, container_id: Optional[str] = None) -> bool:
        return self._with_conn(
            lambda c: delete_row(c, self.package, entity_id, row_id, container_id)
        )

    def set_reference_tags(self, reference_id: str, tags: list[dict]) -> dict:
        def _op(conn):
            set_tags(conn, self.package, "reference_tags_note", reference_id, tags)
            return get_row(conn, self.package, "reference", reference_id)

        return self._with_conn(_op)

    def set_note_tags(self, notebook_id: str, note_id: int, tag_ids: list[str]) -> dict:
        def _op(conn):
            set_note_tags(conn, self.package, notebook_id, note_id, tag_ids)
            return get_row(conn, self.package, "note", note_id, notebook_id)

        return self._with_conn(_op)

    def get_reference_tags(self, reference_id: str) -> list[dict]:
        def _op(conn):
            refs = get_junction_refs(conn, "reference_tags", "reference_id", reference_id)
            return [{"notebook_id": r["notebook_id"], "note_id": r["note_id"]} for r in refs]

        return self._with_conn(_op)

    def connection(self):
        """Context manager for export modules that need direct conn access."""
        return _ConnectionCtx(self.db_path)


class _ConnectionCtx:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.conn = None

    def __enter__(self):
        self.conn = connect(self.db_path)
        return self.conn

    def __exit__(self, *args):
        if self.conn:
            self.conn.close()
