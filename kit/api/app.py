"""FastAPI application."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from kit.api.routes import register_routes
from kit.auth.neon import (
    auth_base_url,
    auth_enabled,
    extract_bearer,
    require_user,
    validate_neon_token,
)
from kit.engine.db import connect, read_meta
from kit.engine.dialect import use_postgres
from kit.engine.migrations import apply_migrations, diff_schema
from kit.engine.runtime import Runtime
from kit.schema.loader import (
    SchemaLoader,
    SchemaValidationError,
    get_loader,
    list_packages,
    reset_loader,
)
from kit.schema.workspaces import WorkspaceStore

ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = ROOT / "static"

_runtime: Optional[Runtime] = None


class AuthMiddleware(BaseHTTPMiddleware):
    """Require Neon Auth JWT on /api/* except public health/config endpoints."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not auth_enabled() or not path.startswith("/api/"):
            return await call_next(request)
        if path == "/api/health" or path == "/api/auth/config":
            return await call_next(request)
        token = extract_bearer(request)
        claims = validate_neon_token(token) if token else None
        if not claims:
            return JSONResponse({"detail": "Authentication required"}, status_code=401)
        request.state.user = claims
        return await call_next(request)


class DevStaticNoCacheMiddleware(BaseHTTPMiddleware):
    """Avoid stale ES module caches during local development."""

    _CONDITIONAL_HEADERS = frozenset({b"if-none-match", b"if-modified-since"})

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if path.startswith("/static/") or path == "/":
            # Strip validators so StaticFiles cannot answer 304 with a stale body.
            request.scope["headers"] = [
                (name, value)
                for name, value in request.scope["headers"]
                if name.lower() not in self._CONDITIONAL_HEADERS
            ]

        response = await call_next(request)
        if path.startswith("/static/") or path == "/":
            response.headers["Cache-Control"] = "no-store, must-revalidate"
            for header in ("etag", "last-modified"):
                if header in response.headers:
                    del response.headers[header]
        return response


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
    app.state.workspace_store = WorkspaceStore(ROOT)
    return _runtime


def _reload_after_workspace_change(app: FastAPI) -> dict[str, Any]:
    reset_loader()
    loader = get_loader(ROOT)
    runtime = reload_app_state(app, loader)
    return {
        "schema": loader.to_json(),
        "active_id": app.state.workspace_store.get_active_id(),
        "meta": read_meta(runtime.db_path, workspace_id=runtime.workspace_id),
    }


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
    app.add_middleware(DevStaticNoCacheMiddleware)
    app.add_middleware(AuthMiddleware)
    app.state.runtime = runtime
    app.state.schema_loader = schema_loader
    app.state.root = ROOT
    app.state.workspace_store = WorkspaceStore(ROOT)
    app.state.workspace_store.ensure_initialized()

    @app.get("/api/auth/config")
    def get_auth_config() -> dict:
        return {
            "enabled": auth_enabled(),
            "authUrl": auth_base_url() if auth_enabled() else None,
            "providers": {"email": True, "google": True},
        }

    @app.get("/api/auth/me")
    def get_auth_me(request: Request) -> dict:
        user = require_user(request)
        return {
            "id": user.get("id") or user.get("sub"),
            "email": user.get("email"),
            "name": user.get("name"),
            "emailVerified": user.get("emailVerified"),
        }

    @app.get("/api/workspaces")
    def list_workspaces() -> dict:
        store: WorkspaceStore = app.state.workspace_store
        return {
            "active_id": store.get_active_id(),
            "workspaces": store.list_workspaces(),
        }

    @app.post("/api/workspaces")
    def create_workspace(body: dict[str, Any]) -> dict:
        title = (body.get("title") or "").strip() or "Workspace"
        template = body.get("template") or "blank"
        format_type = (body.get("format_type") or "").strip() or None
        store: WorkspaceStore = app.state.workspace_store
        try:
            created = store.create(
                title=title,
                template=template,
                default_field_type=format_type,
                set_active=True,
            )
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        payload = _reload_after_workspace_change(app)
        return {"ok": True, "workspace": created["workspace"], **payload}

    @app.post("/api/workspaces/{workspace_id}/activate")
    def activate_workspace(workspace_id: str) -> dict:
        store: WorkspaceStore = app.state.workspace_store
        try:
            store.activate(workspace_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        payload = _reload_after_workspace_change(app)
        return {"ok": True, **payload}

    @app.post("/api/workspaces/{workspace_id}/start-over")
    def start_over_workspace(workspace_id: str) -> dict:
        store: WorkspaceStore = app.state.workspace_store
        try:
            store.start_over(workspace_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        if store.get_active_id() != workspace_id:
            store.activate(workspace_id)
        payload = _reload_after_workspace_change(app)
        return {"ok": True, **payload}

    @app.delete("/api/workspaces/{workspace_id}")
    def delete_workspace(workspace_id: str) -> dict:
        store: WorkspaceStore = app.state.workspace_store
        try:
            store.delete_workspace(workspace_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        payload = _reload_after_workspace_change(app)
        return {"ok": True, **payload}

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
        conn = connect(db_path, workspace_id=app.state.runtime.workspace_id)
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
        conn = connect(db_path, workspace_id=package_obj.site.id)
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
            "meta": read_meta(runtime_obj.db_path, workspace_id=runtime_obj.workspace_id),
        }

    @app.post("/api/schema/package/{package_id}")
    def load_schema_package(package_id: str) -> dict:
        try:
            loader_inst: SchemaLoader = app.state.schema_loader
            loader_inst.load_package_into_active(package_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        except SchemaValidationError as exc:
            raise HTTPException(400, str(exc)) from exc

        runtime_obj: Runtime = app.state.runtime
        conn = connect(runtime_obj.db_path, workspace_id=loader_inst.package.site.id)
        preview: dict[str, Any] = {}
        try:
            preview = diff_schema(conn, loader_inst.package)
            if preview.get("destructive"):
                store: WorkspaceStore = app.state.workspace_store
                store.start_over(store.get_active_id())
                reset_loader()
                loader_inst = get_loader(ROOT)
                loader_inst.load_package_into_active(package_id)
                runtime_obj = Runtime(loader_inst.package, ROOT)
                app.state.runtime = runtime_obj
                app.state.schema_loader = loader_inst
                conn.close()
                conn = connect(runtime_obj.db_path, workspace_id=runtime_obj.workspace_id)
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
        return {
            "database": "neon" if use_postgres() else str(rt.db_path.name),
            "meta": read_meta(rt.db_path, workspace_id=rt.workspace_id),
        }

    @app.get("/api/health")
    def get_health() -> dict:
        sl: SchemaLoader = app.state.schema_loader
        pkg = sl.package
        store: WorkspaceStore = app.state.workspace_store
        return {
            "status": "ok",
            "site_id": pkg.site.id,
            "workspace_id": store.get_active_id(),
            "schema_version": pkg.schema_version,
            "package": sl.package_name,
            "source": sl.source,
            "auth_enabled": auth_enabled(),
        }

    @app.get("/")
    def editor() -> FileResponse:
        editor_path = STATIC_DIR / "editor.html"
        if not editor_path.is_file():
            raise HTTPException(status_code=404, detail="editor.html not found")
        return FileResponse(
            editor_path,
            headers={"Cache-Control": "no-store, must-revalidate", "Pragma": "no-cache"},
        )

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
