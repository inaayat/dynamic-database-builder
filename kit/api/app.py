"""FastAPI application."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from kit.api.routes import register_routes
from kit.engine.db import connect, read_meta
from kit.engine.migrations import apply_migrations, diff_schema
from kit.engine.runtime import Runtime
from kit.schema.loader import (
    SchemaLoader,
    SchemaValidationError,
    get_loader,
    list_packages,
)

ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "static"

_runtime: Optional[Runtime] = None


def get_runtime(loader: SchemaLoader) -> Runtime:
    global _runtime
    if _runtime is None:
        _runtime = Runtime(loader.package, ROOT)
    return _runtime


def reload_app_state(app: FastAPI, loader: SchemaLoader) -> Runtime:
    """Reload schema + runtime after Design tab apply."""
    global _runtime
    loader.reload()
    _runtime = Runtime(loader.package, ROOT)
    app.state.runtime = _runtime
    app.state.schema_loader = loader
    return _runtime


def create_app(loader: Optional[SchemaLoader] = None) -> FastAPI:
    schema_loader = loader or get_loader(ROOT)
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
    app.state.root = ROOT

    @app.get("/api/schema")
    def get_schema() -> dict:
        return app.state.schema_loader.to_json()

    @app.get("/api/schema/packages")
    def get_schema_packages() -> dict:
        return {"packages": list_packages()}

    @app.patch("/api/schema")
    def patch_schema(body: dict[str, Any]) -> dict:
        if not body:
            raise HTTPException(400, "Empty patch body")
        try:
            loader_inst: SchemaLoader = app.state.schema_loader
            package_obj = loader_inst.patch(body)
        except SchemaValidationError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc
        return {
            "ok": True,
            "schema": loader_inst.to_json(),
            "site_id": package_obj.site.id,
        }

    @app.post("/api/schema/validate")
    def validate_schema(body: Optional[dict[str, Any]] = None) -> dict:
        data = body if body else app.state.schema_loader.to_json()
        result = SchemaLoader.validate(data)
        conn = connect(db_path)
        try:
            if result["valid"]:
                package_for_diff = SitePackageFromDict(data)
                result["diff"] = diff_schema(conn, package_for_diff)
        finally:
            conn.close()
        return result

    @app.post("/api/schema/apply")
    def apply_schema(body: Optional[dict[str, Any]] = None) -> dict:
        loader_inst: SchemaLoader = app.state.schema_loader
        data = body if body else loader_inst.to_json()
        validation = SchemaLoader.validate(data)
        if not validation["valid"]:
            raise HTTPException(400, {"errors": validation["errors"]})

        package_obj = SitePackageFromDict(data)
        conn = connect(db_path)
        try:
            preview = diff_schema(conn, package_obj)
            if preview.get("destructive"):
                raise HTTPException(
                    409,
                    {
                        "message": "Destructive changes blocked — export backup first",
                        "diff": preview,
                    },
                )
            loader_inst.save(data)
            apply_migrations(conn, package_obj, preview)
        finally:
            conn.close()

        runtime_obj = reload_app_state(app, loader_inst)
        return {
            "ok": True,
            "diff": preview,
            "schema": loader_inst.to_json(),
            "meta": read_meta(runtime_obj.db_path),
        }

    @app.post("/api/schema/package/{package_id}")
    def load_schema_package(package_id: str) -> dict:
        try:
            loader_inst: SchemaLoader = app.state.schema_loader
            loader_inst.load_package(package_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        except SchemaValidationError as exc:
            raise HTTPException(400, str(exc)) from exc

        conn = connect(db_path)
        preview: dict[str, Any] = {}
        try:
            preview = diff_schema(conn, loader_inst.package)
            if not preview.get("destructive"):
                apply_migrations(conn, loader_inst.package, preview)
        finally:
            conn.close()

        reload_app_state(app, loader_inst)
        return {
            "ok": True,
            "package": package_id,
            "schema": loader_inst.to_json(),
            "diff": preview,
        }

    @app.get("/api/meta")
    def get_meta() -> dict:
        rt: Runtime = app.state.runtime
        return {"database": str(rt.db_path.name), "meta": read_meta(rt.db_path)}

    @app.get("/api/health")
    def get_health() -> dict:
        sl: SchemaLoader = app.state.schema_loader
        pkg = sl.package
        return {
            "status": "ok",
            "site_id": pkg.site.id,
            "schema_version": pkg.schema_version,
            "package": sl.package_name,
            "source": sl.source,
        }

    @app.get("/")
    def editor() -> FileResponse:
        editor_path = STATIC_DIR / "editor.html"
        if not editor_path.is_file():
            raise HTTPException(status_code=404, detail="editor.html not found")
        return FileResponse(editor_path)

    app.include_router(register_routes())

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    return app


def SitePackageFromDict(data: dict):
    from kit.schema.model import SitePackage

    package = SitePackage.model_validate(data)
    SchemaLoader.validate_semantics(package)
    return package


app = create_app()
