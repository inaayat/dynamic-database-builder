#!/usr/bin/env python3
"""Back up data/workspaces/ to a git repo and push to GitHub."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from kit.backup.github import BackupConfigError, backup_workspaces_to_git  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Back up workspaces to GitHub.")
    parser.add_argument(
        "--no-push",
        action="store_true",
        help="Commit locally without pushing.",
    )
    args = parser.parse_args()

    try:
        result = backup_workspaces_to_git(ROOT, push=not args.no_push)
    except BackupConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Backup failed: {exc}", file=sys.stderr)
        return 1

    print(result.message)
    if result.commit:
        print(f"  commit: {result.commit}")
    print(f"  dir:    {result.backup_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
