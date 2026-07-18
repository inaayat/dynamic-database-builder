"""SQL dialect helpers for SQLite (local) vs Postgres (Neon)."""

from __future__ import annotations

import os
import re
from typing import Any, Optional, Sequence


def use_postgres() -> bool:
    return bool(os.environ.get("DATABASE_URL"))


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def workspace_schema_name(workspace_id: str) -> str:
    safe = re.sub(r"[^a-z0-9_]", "_", workspace_id.lower()).strip("_") or "workspace"
    return f"ws_{safe}"


def q_ident(ident: str) -> str:
    """Quote an identifier for Postgres (always double-quoted)."""
    return '"' + ident.replace('"', '""') + '"'


def translate_placeholders(sql: str) -> str:
    """Convert SQLite `?` placeholders to psycopg `%s`."""
    return sql.replace("?", "%s")


_OR_IGNORE = re.compile(r"INSERT\s+OR\s+IGNORE\s+INTO", re.IGNORECASE)
_OR_REPLACE = re.compile(r"INSERT\s+OR\s+REPLACE\s+INTO", re.IGNORECASE)


def translate_upsert(sql: str) -> str:
    """Rewrite SQLite upsert dialects to Postgres ON CONFLICT forms."""
    if _OR_IGNORE.search(sql):
        sql = _OR_IGNORE.sub("INSERT INTO", sql)
        if "ON CONFLICT" not in sql.upper():
            sql = sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
        return sql
    if _OR_REPLACE.search(sql):
        # Used for _meta(key, value) — conflict on primary key `key`.
        sql = _OR_REPLACE.sub("INSERT INTO", sql)
        if "ON CONFLICT" not in sql.upper():
            sql = (
                sql.rstrip().rstrip(";")
                + " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            )
        return sql
    return sql


def prepare_sql(sql: str) -> str:
    if not use_postgres():
        return sql
    return translate_placeholders(translate_upsert(sql))


class Row(dict):
    """Dict row that also supports positional index access like sqlite3.Row."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

    def keys(self):  # type: ignore[override]
        return super().keys()
