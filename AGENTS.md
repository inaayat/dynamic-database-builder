# AGENTS.md

## Cursor Cloud specific instructions

### Service: local editor app (FastAPI + uvicorn)

Single Python service. Standard run/setup steps live in `README.md` ("Run locally"). Notes that are not obvious from the README:

- Dependencies are installed into a virtualenv at `.venv` (created by the startup update script). Run the dev server with `. .venv/bin/activate && python run.py`, which serves the editor at `http://127.0.0.1:8771/` with autoreload watching `kit/` and `static/`.
- The system package `python3.12-venv` is required to create the venv; it is installed in the base image, not by the update script.
- Local-first mode needs no external services: workspaces and rows persist to SQLite under `data/workspaces/<id>/data.db` (gitignored). Only when `DATABASE_URL` is set does it switch to Neon Postgres, and only when `NEON_AUTH_BASE_URL` is set does sign-in become required — locally, auth is disabled and the app boots straight into the editor.
- No template packages ship in `kit/schema/defaults/`, so `GET /api/schema/packages` is empty and a fresh workspace starts blank (zero entities). To get data, define entities in the **Setup** (Design) tab wizard ("Start brainstorm") and click **Finish & open Browse** / **Apply Changes**; that runs the dynamic DDL that creates the tables. Then add rows in the **Browse** tab.
- There is no configured linter and no automated test suite in this repo.
