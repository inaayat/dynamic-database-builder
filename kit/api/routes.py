"""REST API routes for Phase 1 notes KB."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from kit.engine.export.json_export import export_json_zip
from kit.engine.export.xlsx_export import export_xlsx
from kit.engine.runtime import Runtime

router = APIRouter(prefix="/api")


class TagRefsBody(BaseModel):
    tags: list[dict[str, Any]]


class TagIdsBody(BaseModel):
    tag_ids: list[str]


def _runtime(request: Request) -> Runtime:
    return request.app.state.runtime


def register_routes() -> APIRouter:
    @router.get("/notebooks")
    def list_notebooks(request: Request):
        return _runtime(request).list_rows("notebook")

    @router.get("/notes")
    def list_notes(request: Request, notebook_id: str = Query(...)):
        return _runtime(request).list_rows("note", notebook_id)

    @router.get("/notes/{note_id}")
    def get_note(request: Request, note_id: int, notebook_id: str = Query(...)):
        row = _runtime(request).get_row("note", note_id, notebook_id)
        if not row:
            raise HTTPException(404, "Note not found")
        return row

    @router.patch("/notes/{note_id}")
    def patch_note(request: Request, note_id: int, body: dict, notebook_id: str = Query(...)):
        row = _runtime(request).patch_row("note", note_id, body, notebook_id)
        if not row:
            raise HTTPException(404, "Note not found")
        return row

    @router.post("/notes")
    def create_note(request: Request, body: dict, notebook_id: str = Query(...)):
        return _runtime(request).create_row("note", body, notebook_id)

    @router.put("/notes/{note_id}/tags")
    def put_note_tags(
        request: Request, note_id: int, body: TagIdsBody, notebook_id: str = Query(...)
    ):
        return _runtime(request).set_note_tags(notebook_id, note_id, body.tag_ids)

    @router.get("/references")
    def list_references(request: Request):
        return _runtime(request).list_rows("reference")

    @router.post("/references")
    def create_reference(request: Request, body: dict):
        return _runtime(request).create_row("reference", body)

    @router.patch("/references/{ref_id}")
    def patch_reference(request: Request, ref_id: str, body: dict):
        row = _runtime(request).patch_row("reference", ref_id, body)
        if not row:
            raise HTTPException(404, "Reference not found")
        return row

    @router.put("/references/{ref_id}/tags")
    def put_reference_tags(request: Request, ref_id: str, body: TagRefsBody):
        rt = _runtime(request)
        rt.set_reference_tags(ref_id, body.tags)
        return {"id": ref_id, "tags": rt.get_reference_tags(ref_id)}

    @router.get("/references/{ref_id}/tags")
    def get_reference_tags(request: Request, ref_id: str):
        return _runtime(request).get_reference_tags(ref_id)

    @router.get("/tags")
    def list_tags(request: Request):
        return _runtime(request).list_rows("tag")

    @router.post("/tags")
    def create_tag(request: Request, body: dict):
        return _runtime(request).create_row("tag", body)

    @router.patch("/tags/{tag_id}")
    def patch_tag(request: Request, tag_id: str, body: dict):
        row = _runtime(request).patch_row("tag", tag_id, body)
        if not row:
            raise HTTPException(404, "Tag not found")
        return row

    @router.get("/export/json.zip")
    def export_json(request: Request):
        data = export_json_zip(_runtime(request))
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=export.zip"},
        )

    @router.get("/export/xlsx")
    def export_xlsx_route(request: Request):
        data = export_xlsx(_runtime(request))
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=export.xlsx"},
        )

    return router
