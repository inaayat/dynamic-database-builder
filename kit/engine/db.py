"""SQLite database bootstrap for Phase 0."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from kit.schema.model import SitePackage

META_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS _meta (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def get_db_path(package: SitePackage, root: Optional[Path] = None) -> Path:
    root = root or Path.cwd()
    db_name = package.storage.local_db if package.storage else "planning.db"
    return root / db_name


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_meta(conn: sqlite3.Connection, package: SitePackage) -> None:
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
    """Create or open planning.db and ensure _meta table is populated."""
    db_path = get_db_path(package, root)
    conn = connect(db_path)
    try:
        init_meta(conn, package)
    finally:
        conn.close()
    return db_path


def read_meta(db_path: Path) -> dict[str, str]:
    if not db_path.is_file():
        return {}
    conn = connect(db_path)
    try:
        rows = conn.execute("SELECT key, value FROM _meta").fetchall()
        return {row["key"]: row["value"] for row in rows}
    finally:
        conn.close()
