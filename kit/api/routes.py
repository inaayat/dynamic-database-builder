"""REST API routes for Phase 1 notes KB."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
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


def register_routes(runtime: Runtime) -> APIRouter:
    @router.get("/notebooks")
    def list_notebooks():
        return runtime.list_rows("notebook")

    @router.get("/notes")
    def list_notes(notebook_id: str = Query(...)):
        return runtime.list_rows("note", notebook_id)

    @router.get("/notes/{note_id}")
    def get_note(note_id: int, notebook_id: str = Query(...)):
        row = runtime.get_row("note", note_id, notebook_id)
        if not row:
            raise HTTPException(404, "Note not found")
        return row

    @router.patch("/notes/{note_id}")
    def patch_note(note_id: int, body: dict, notebook_id: str = Query(...)):
        row = runtime.patch_row("note", note_id, body, notebook_id)
        if not row:
            raise HTTPException(404, "Note not found")
        return row

    @router.post("/notes")
    def create_note(body: dict, notebook_id: str = Query(...)):
        return runtime.create_row("note", body, notebook_id)

    @router.put("/notes/{note_id}/tags")
    def put_note_tags(note_id: int, body: TagIdsBody, notebook_id: str = Query(...)):
        return runtime.set_note_tags(notebook_id, note_id, body.tag_ids)

    @router.get("/references")
    def list_references():
        return runtime.list_rows("reference")

    @router.post("/references")
    def create_reference(body: dict):
        return runtime.create_row("reference", body)

    @router.patch("/references/{ref_id}")
    def patch_reference(ref_id: str, body: dict):
        row = runtime.patch_row("reference", ref_id, body)
        if not row:
            raise HTTPException(404, "Reference not found")
        return row

    @router.put("/references/{ref_id}/tags")
    def put_reference_tags(ref_id: str, body: TagRefsBody):
        runtime.set_reference_tags(ref_id, body.tags)
        return {"id": ref_id, "tags": runtime.get_reference_tags(ref_id)}

    @router.get("/references/{ref_id}/tags")
    def get_reference_tags(ref_id: str):
        return runtime.get_reference_tags(ref_id)

    @router.get("/tags")
    def list_tags():
        return runtime.list_rows("tag")

    @router.post("/tags")
    def create_tag(body: dict):
        return runtime.create_row("tag", body)

    @router.patch("/tags/{tag_id}")
    def patch_tag(tag_id: str, body: dict):
        row = runtime.patch_row("tag", tag_id, body)
        if not row:
            raise HTTPException(404, "Tag not found")
        return row

    @router.get("/export/json.zip")
    def export_json():
        data = export_json_zip(runtime)
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=export.zip"},
        )

    @router.get("/export/xlsx")
    def export_xlsx_route():
        data = export_xlsx(runtime)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=export.xlsx"},
        )

    return router
