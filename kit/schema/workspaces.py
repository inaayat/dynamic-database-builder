"""Multi-workspace registry — each workspace has its own schema + SQLite DB."""

from __future__ import annotations

import copy
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from kit.schema.loader import DEFAULTS_DIR

LEGACY_ACTIVE = "data/active-schema.json"
WORKSPACES_DIR = "data/workspaces"
INDEX_NAME = "index.json"


def _slugify(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")
    slug = re.sub(r"_+", "_", slug)
    if slug.endswith("s") and len(slug) > 1:
        slug = slug[:-1]
    return slug or "workspace"


def blank_schema(workspace_id: str, title: str, db_relpath: str, port: int = 8771) -> dict[str, Any]:
    return {
        "schema_version": "1.1",
        "title": title,
        "site": {
            "id": workspace_id,
            "title": title,
            "port": port,
            "deployment": {"mode": "local_only"},
        },
        "storage": {"local_db": db_relpath},
        "format_conventions": {"bullet_separator": "\u001e"},
        "entity_types": {},
        "relationships": [],
        "views": [],
        "actions": [],
        "export_profiles": {},
        "seed": {},
    }


class WorkspaceStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.dir = root / WORKSPACES_DIR
        self.index_path = self.dir / INDEX_NAME

    def ensure_initialized(self) -> dict[str, Any]:
        if self.index_path.is_file():
            return self._read_index()
        self.dir.mkdir(parents=True, exist_ok=True)
        legacy = self.root / LEGACY_ACTIVE
        if legacy.is_file():
            data = self._read_json(legacy)
            ws_id = _slugify(data.get("site", {}).get("id") or data.get("site", {}).get("title") or "workspace")
            title = data.get("site", {}).get("title") or "My Workspace"
            data = self._migrate_legacy_db(ws_id, data)
            self._materialize_workspace(ws_id, title, data, set_active=True)
        else:
            self.create(title="My Workspace", template="blank", set_active=True)
        return self._read_index()

    def _read_index(self) -> dict[str, Any]:
        return self._read_json(self.index_path)

    def _write_index(self, index: dict[str, Any]) -> None:
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        with self.index_path.open("w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
            f.write("\n")

    def _read_json(self, path: Path) -> dict[str, Any]:
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def _write_json(self, path: Path, data: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

    def list_workspaces(self) -> list[dict[str, Any]]:
        index = self.ensure_initialized()
        active = index.get("active_id")
        items = []
        for entry in index.get("workspaces", []):
            ws = dict(entry)
            ws["active"] = ws["id"] == active
            ws["empty"] = self.is_empty(ws["id"])
            items.append(ws)
        return items

    def get_active_id(self) -> str:
        index = self.ensure_initialized()
        active = index.get("active_id")
        if not active:
            raise FileNotFoundError("No active workspace")
        return active

    def workspace_dir(self, workspace_id: str) -> Path:
        return self.dir / workspace_id

    def schema_path(self, workspace_id: Optional[str] = None) -> Path:
        ws_id = workspace_id or self.get_active_id()
        return self.workspace_dir(ws_id) / "schema.json"

    def active_schema_path(self) -> Path:
        return self.schema_path(self.get_active_id())

    def load_schema(self, workspace_id: Optional[str] = None) -> dict[str, Any]:
        path = self.schema_path(workspace_id)
        if not path.is_file():
            raise FileNotFoundError(f"Workspace schema not found: {path}")
        return self._read_json(path)

    def save_schema(self, data: dict[str, Any], workspace_id: Optional[str] = None) -> Path:
        path = self.schema_path(workspace_id)
        self._write_json(path, data)
        return path

    def is_empty(self, workspace_id: str) -> bool:
        try:
            data = self.load_schema(workspace_id)
        except FileNotFoundError:
            return True
        return not (data.get("entity_types") or {})

    def _unique_id(self, base: str) -> str:
        index = self._read_index()
        existing = {w["id"] for w in index.get("workspaces", [])}
        if base not in existing:
            return base
        n = 2
        while f"{base}_{n}" in existing:
            n += 1
        return f"{base}_{n}"

    def _db_relpath(self, workspace_id: str) -> str:
        return f"{WORKSPACES_DIR}/{workspace_id}/data.db"

    def _migrate_legacy_db(self, workspace_id: str, schema: dict[str, Any]) -> dict[str, Any]:
        schema = copy.deepcopy(schema)
        old_db = (schema.get("storage") or {}).get("local_db", "planning.db")
        new_db = self._db_relpath(workspace_id)
        old_path = self.root / old_db
        new_path = self.root / new_db
        if old_path.is_file() and old_path.resolve() != new_path.resolve():
            new_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old_path), str(new_path))
            for suffix in ("-wal", "-shm"):
                side = Path(str(old_path) + suffix)
                if side.is_file():
                    shutil.move(str(side), str(Path(str(new_path) + suffix)))
        schema.setdefault("storage", {})
        schema["storage"]["local_db"] = new_db
        return schema

    def _materialize_workspace(
        self,
        workspace_id: str,
        title: str,
        schema: dict[str, Any],
        *,
        set_active: bool = False,
    ) -> dict[str, Any]:
        ws_dir = self.workspace_dir(workspace_id)
        ws_dir.mkdir(parents=True, exist_ok=True)
        db_path = self._db_relpath(workspace_id)
        schema = copy.deepcopy(schema)
        schema.setdefault("site", {})
        schema["site"]["id"] = workspace_id
        schema["site"]["title"] = title
        schema.setdefault("storage", {})
        schema["storage"]["local_db"] = db_path
        self._write_json(ws_dir / "schema.json", schema)

        index = self._read_index() if self.index_path.is_file() else {"workspaces": []}
        entry = {
            "id": workspace_id,
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        workspaces = [w for w in index.get("workspaces", []) if w["id"] != workspace_id]
        workspaces.append(entry)
        index["workspaces"] = workspaces
        if set_active or not index.get("active_id"):
            index["active_id"] = workspace_id
        self._write_index(index)
        return entry

    def schema_from_template(self, package_id: str, workspace_id: str, title: str) -> dict[str, Any]:
        path = DEFAULTS_DIR / f"{package_id}.json"
        if not path.is_file():
            raise FileNotFoundError(f"Schema package not found: {package_id}")
        data = copy.deepcopy(self._read_json(path))
        data["site"] = {**(data.get("site") or {}), "id": workspace_id, "title": title}
        data.setdefault("storage", {})
        data["storage"]["local_db"] = self._db_relpath(workspace_id)
        return data

    def create(
        self,
        *,
        title: str,
        template: str = "blank",
        set_active: bool = True,
    ) -> dict[str, Any]:
        self.dir.mkdir(parents=True, exist_ok=True)
        if not self.index_path.is_file():
            self._write_index({"workspaces": [], "active_id": None})
        trimmed = title.strip() or "Workspace"
        ws_id = self._unique_id(_slugify(trimmed))
        if template == "blank":
            schema = blank_schema(ws_id, trimmed, self._db_relpath(ws_id))
        else:
            schema = self.schema_from_template(template, ws_id, trimmed)
        entry = self._materialize_workspace(ws_id, trimmed, schema, set_active=set_active)
        return {"workspace": entry, "schema": schema}

    def activate(self, workspace_id: str) -> dict[str, Any]:
        index = self.ensure_initialized()
        ids = {w["id"] for w in index.get("workspaces", [])}
        if workspace_id not in ids:
            raise FileNotFoundError(f"Unknown workspace: {workspace_id}")
        index["active_id"] = workspace_id
        self._write_index(index)
        return {"active_id": workspace_id, "schema": self.load_schema(workspace_id)}

    def _delete_db_files(self, db_relpath: str) -> None:
        db_path = self.root / db_relpath
        for suffix in ("", "-wal", "-shm"):
            path = Path(str(db_path) + suffix) if suffix else db_path
            if path.is_file():
                path.unlink()

    def start_over(self, workspace_id: Optional[str] = None) -> dict[str, Any]:
        ws_id = workspace_id or self.get_active_id()
        index = self.ensure_initialized()
        entry = next((w for w in index.get("workspaces", []) if w["id"] == ws_id), None)
        if not entry:
            raise FileNotFoundError(f"Unknown workspace: {ws_id}")
        title = entry.get("title") or ws_id
        current = self.load_schema(ws_id)
        db_relpath = (current.get("storage") or {}).get("local_db") or self._db_relpath(ws_id)
        port = (current.get("site") or {}).get("port") or 8771
        self._delete_db_files(db_relpath)
        schema = blank_schema(ws_id, title, db_relpath, port=port)
        self.save_schema(schema, ws_id)
        return {"workspace_id": ws_id, "schema": schema}

    def delete_workspace(self, workspace_id: str) -> None:
        index = self.ensure_initialized()
        workspaces = index.get("workspaces", [])
        if len(workspaces) <= 1:
            raise ValueError("Cannot delete the only workspace")
        match = next((w for w in workspaces if w["id"] == workspace_id), None)
        if not match:
            raise FileNotFoundError(f"Unknown workspace: {workspace_id}")
        try:
            schema = self.load_schema(workspace_id)
            db_relpath = (schema.get("storage") or {}).get("local_db")
            if db_relpath:
                self._delete_db_files(db_relpath)
        except FileNotFoundError:
            pass
        ws_dir = self.workspace_dir(workspace_id)
        if ws_dir.is_dir():
            shutil.rmtree(ws_dir)
        remaining = [w for w in workspaces if w["id"] != workspace_id]
        index["workspaces"] = remaining
        if index.get("active_id") == workspace_id:
            index["active_id"] = remaining[0]["id"]
        self._write_index(index)
