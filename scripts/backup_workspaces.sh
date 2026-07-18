#!/usr/bin/env bash
# Back up data/workspaces/ to a configured git repo and push to GitHub.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="python3"
fi
exec "$PYTHON" "$ROOT/scripts/backup_to_github.py" "$@"
