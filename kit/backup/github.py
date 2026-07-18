"""Copy local workspaces to a git repo and push to GitHub."""

from __future__ import annotations

import io
import json
import os
import shutil
import sqlite3
import subprocess
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from kit.engine.export.json_export import export_json_zip
from kit.engine.runtime import Runtime
from kit.schema.workspaces import WORKSPACES_DIR

BACKUP_CONFIG = "data/backup-config.json"


class BackupConfigError(Exception):
    """Backup destination is not configured or invalid."""


@dataclass
class BackupResult:
    ok: bool
    committed: bool
    message: str
    backup_dir: str
    commit: Optional[str] = None
    files_changed: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "committed": self.committed,
            "message": self.message,
            "backup_dir": self.backup_dir,
            "commit": self.commit,
            "files_changed": self.files_changed,
        }


def get_backup_dir(root: Path) -> Path:
    env = os.environ.get("DDB_BACKUP_DIR", "").strip()
    if env:
        return Path(env).expanduser()

    config_path = root / BACKUP_CONFIG
    if config_path.is_file():
        data = json.loads(config_path.read_text(encoding="utf-8"))
        backup_dir = (data.get("backup_dir") or "").strip()
        if backup_dir:
            return Path(backup_dir).expanduser()

    raise BackupConfigError(
        "Backup not configured. Set DDB_BACKUP_DIR or create data/backup-config.json "
        '(example: {"backup_dir": "~/Projects/ddb-workspaces"}).'
    )


def _checkpoint_sqlite(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.commit()
    finally:
        conn.close()


def _copy_workspace_files(root: Path, dest_root: Path) -> int:
    src = root / WORKSPACES_DIR
    if not src.is_dir():
        raise FileNotFoundError(f"Workspace directory not found: {src}")

    dest = dest_root / "workspaces"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    changed = 0

    index = src / "index.json"
    if index.is_file():
        shutil.copy2(index, dest / "index.json")
        changed += 1

    for ws_dir in sorted(p for p in src.iterdir() if p.is_dir()):
        ws_dest = dest / ws_dir.name
        ws_dest.mkdir(parents=True, exist_ok=True)

        schema = ws_dir / "schema.json"
        if schema.is_file():
            shutil.copy2(schema, ws_dest / "schema.json")
            changed += 1

        db = ws_dir / "data.db"
        if db.is_file():
            _checkpoint_sqlite(db)
            shutil.copy2(db, ws_dest / "data.db")
            changed += 1

    return changed


def _write_json_export(runtime: Runtime, dest_root: Path) -> None:
    payload = export_json_zip(runtime)
    export_dir = dest_root / "workspaces" / "_export"
    if export_dir.exists():
        shutil.rmtree(export_dir)
    export_dir.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        zf.extractall(export_dir)


def _run_git(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


def backup_workspaces_to_git(
    root: Path,
    *,
    runtime: Optional[Runtime] = None,
    push: bool = True,
) -> BackupResult:
    backup_dir = get_backup_dir(root)
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not (backup_dir / ".git").is_dir():
        raise BackupConfigError(
            f"{backup_dir} is not a git repository. Run:\n"
            f"  git clone git@github.com:YOUR_USER/ddb-workspaces.git {backup_dir}"
        )

    files_changed = _copy_workspace_files(root, backup_dir)

    if runtime is not None:
        try:
            _write_json_export(runtime, backup_dir)
            files_changed += 1
        except Exception:
            # Export is best-effort; schema + db are the critical backup.
            pass

    meta = {
        "backed_up_at": datetime.now(timezone.utc).isoformat(),
        "source": str((root / WORKSPACES_DIR).resolve()),
    }
    meta_path = backup_dir / "workspaces" / "backup-meta.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    add = _run_git(backup_dir, "add", "-A")
    if add.returncode != 0:
        raise RuntimeError(add.stderr.strip() or "git add failed")

    diff = _run_git(backup_dir, "diff", "--staged", "--quiet")
    if diff.returncode == 0:
        return BackupResult(
            ok=True,
            committed=False,
            message="Nothing to back up.",
            backup_dir=str(backup_dir),
            files_changed=files_changed,
        )

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    commit = _run_git(backup_dir, "commit", "-m", f"Backup {stamp}")
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.strip() or "git commit failed")

    commit_hash: Optional[str] = None
    rev = _run_git(backup_dir, "rev-parse", "--short", "HEAD")
    if rev.returncode == 0:
        commit_hash = rev.stdout.strip() or None

    if push:
        push_result = _run_git(backup_dir, "push")
        if push_result.returncode != 0:
            raise RuntimeError(push_result.stderr.strip() or "git push failed")

    return BackupResult(
        ok=True,
        committed=True,
        message="Backed up to GitHub." if push else "Committed locally (push skipped).",
        backup_dir=str(backup_dir),
        commit=commit_hash,
        files_changed=files_changed,
    )
