"""Database connections — SQLite locally, Postgres (Neon) when DATABASE_URL is set."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Optional, Sequence, Union

from kit.engine.dialect import (
    Row,
    database_url,
    prepare_sql,
    q_ident,
    use_postgres,
    workspace_schema_name,
)
from kit.schema.model import SitePackage

META_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS _meta (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);
"""

ConnectionLike = Union["SqliteConnection", "PostgresConnection"]


class SqliteCursor:
    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self._cursor = cursor

    def fetchone(self) -> Optional[Row]:
        row = self._cursor.fetchone()
        if row is None:
            return None
        return Row({k: row[k] for k in row.keys()})

    def fetchall(self) -> list[Row]:
        rows = self._cursor.fetchall()
        return [Row({k: r[k] for k in r.keys()}) for r in rows]

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount


class SqliteConnection:
    dialect = "sqlite"

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] = ()) -> SqliteCursor:
        return SqliteCursor(self._conn.execute(sql, params))

    def executescript(self, script: str) -> None:
        self._conn.executescript(script)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


class PostgresCursor:
    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor

    def fetchone(self) -> Optional[Row]:
        row = self._cursor.fetchone()
        if row is None:
            return None
        if hasattr(row, "keys"):
            return Row({k: row[k] for k in row.keys()})
        cols = [d.name for d in self._cursor.description]
        return Row(dict(zip(cols, row)))

    def fetchall(self) -> list[Row]:
        rows = self._cursor.fetchall()
        result: list[Row] = []
        for row in rows:
            if hasattr(row, "keys"):
                result.append(Row({k: row[k] for k in row.keys()}))
            else:
                cols = [d.name for d in self._cursor.description]
                result.append(Row(dict(zip(cols, row))))
        return result

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount


class PostgresConnection:
    dialect = "postgres"

    def __init__(self, conn: Any, schema: Optional[str] = None) -> None:
        self._conn = conn
        self.schema = schema
        if schema:
            self._conn.execute(f"CREATE SCHEMA IF NOT EXISTS {q_ident(schema)}")
            self._conn.execute(f"SET search_path TO {q_ident(schema)}, public")

    def execute(self, sql: str, params: Sequence[Any] = ()) -> PostgresCursor:
        prepared = prepare_sql(sql)
        cur = self._conn.execute(prepared, tuple(params))
        return PostgresCursor(cur)

    def executescript(self, script: str) -> None:
        for stmt in script.split(";"):
            stmt = stmt.strip()
            if stmt:
                self._conn.execute(prepare_sql(stmt))

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def get_db_path(package: SitePackage, root: Optional[Path] = None) -> Path:
    root = root or Path.cwd()
    db_name = package.storage.local_db if package.storage else "planning.db"
    return root / db_name


def connect_sqlite(db_path: Path) -> SqliteConnection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(db_path, check_same_thread=False, timeout=10)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    raw.execute("PRAGMA journal_mode = WAL")
    return SqliteConnection(raw)


def connect_postgres(workspace_id: Optional[str] = None) -> PostgresConnection:
    import psycopg
    from psycopg.rows import dict_row

    raw = psycopg.connect(database_url(), row_factory=dict_row, autocommit=False)
    schema = workspace_schema_name(workspace_id) if workspace_id else None
    return PostgresConnection(raw, schema=schema)


def connect(
    db_path: Optional[Path] = None,
    *,
    workspace_id: Optional[str] = None,
) -> ConnectionLike:
    if use_postgres():
        return connect_postgres(workspace_id)
    if db_path is None:
        raise ValueError("db_path is required for SQLite mode")
    return connect_sqlite(db_path)


def init_meta(conn: ConnectionLike, package: SitePackage) -> None:
    conn.executescript(META_TABLE_SQL)
    conn.execute(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)",
        ("schema_version", package.schema_version),
    )
    conn.execute(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)",
        ("site_id", package.site.id),
    )
    conn.execute(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)",
        ("package_name", package.title or package.site.id),
    )
    conn.commit()


def init_database(package: SitePackage, root: Optional[Path] = None) -> Path:
    """Create or open planning.db and ensure _meta table is populated (SQLite only)."""
    db_path = get_db_path(package, root)
    conn = connect(db_path, workspace_id=package.site.id)
    try:
        init_meta(conn, package)
    finally:
        conn.close()
    return db_path


def read_meta(db_path: Optional[Path] = None, *, workspace_id: Optional[str] = None) -> dict[str, str]:
    if use_postgres():
        conn = connect(workspace_id=workspace_id)
        try:
            try:
                rows = conn.execute("SELECT key, value FROM _meta").fetchall()
            except Exception:
                return {}
            return {row["key"]: row["value"] for row in rows}
        finally:
            conn.close()
    if db_path is None or not db_path.is_file():
        return {}
    conn = connect(db_path)
    try:
        rows = conn.execute("SELECT key, value FROM _meta").fetchall()
        return {row["key"]: row["value"] for row in rows}
    finally:
        conn.close()
