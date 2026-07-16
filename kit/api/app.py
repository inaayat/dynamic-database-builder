"""FastAPI application."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from kit.api.routes import register_routes
from kit.engine.db import read_meta
from kit.engine.runtime import Runtime
from kit.schema.loader import SchemaLoader, SchemaValidationError, get_loader

ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "static"

_runtime: Optional[Runtime] = None


def get_runtime(loader: SchemaLoader) -> Runtime:
    global _runtime
    if _runtime is None:
        _runtime = Runtime(loader.package, ROOT)
    return _runtime


def create_app(loader: Optional[SchemaLoader] = None) -> FastAPI:
    schema_loader = loader or get_loader()
    package = schema_loader.package
    runtime = get_runtime(schema_loader)
    db_path = runtime.db_path

    app = FastAPI(
        title=package.site.title,
        description=package.description or "Dynamic Database Builder",
        version=package.schema_version,
    )
    app.state.runtime = runtime
    app.state.schema_loader = schema_loader

    @app.get("/api/schema")
    def get_schema() -> dict:
        return schema_loader.to_json()

    @app.get("/api/meta")
    def get_meta() -> dict:
        return {"database": str(db_path.name), "meta": read_meta(db_path)}

    @app.get("/api/health")
    def health() -> dict:
        return {
            "status": "ok",
            "site_id": package.site.id,
            "schema_version": package.schema_version,
            "package": schema_loader.package_name,
        }

    @app.get("/")
    def editor() -> FileResponse:
        editor_path = STATIC_DIR / "editor.html"
        if not editor_path.is_file():
            raise HTTPException(status_code=404, detail="editor.html not found")
        return FileResponse(editor_path)

    app.include_router(register_routes(runtime))

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    return app


app = create_app()
