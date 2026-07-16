"""JSON export as zip for browser download."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import date

from kit.engine.junction import get_tag_names_for_note
from kit.engine.sql import q
from kit.engine.runtime import Runtime


def export_json_zip(runtime: Runtime) -> bytes:
    conn = runtime.conn
    package = runtime.package
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        notebooks = conn.execute("SELECT * FROM notebooks").fetchall()
        for nb in notebooks:
            nb_id = nb["id"]
            notes = conn.execute(
                "SELECT * FROM notes WHERE notebook_id = ? ORDER BY id",
                (nb_id,),
            ).fetchall()
            note_list = []
            for n in notes:
                nd = dict(n)
                body = nd.get("body") or ""
                sep = "\x1e"
                bullets = [p.strip() for p in body.split(sep) if p.strip()] if sep in body else [
                    l.strip() for l in body.split("\n") if l.strip()
                ]
                note_list.append({
                    "id": nd["id"],
                    "title": nd["title"],
                    "body": bullets,
                    "references": nd.get("references") or "",
                    "status": nd.get("status") or "",
                    "tags": get_tag_names_for_note(conn, nb_id, nd["id"]),
                })
            payload = {
                "id": nb_id,
                "title": nb["title"],
                "updated": date.today().isoformat(),
                "notes": note_list,
            }
            zf.writestr(f"data/{nb_id}.json", json.dumps(payload, indent=2, ensure_ascii=False))

        refs = conn.execute(f'SELECT * FROM {q("references")} ORDER BY title').fetchall()
        ref_tags = conn.execute("SELECT * FROM reference_tags").fetchall()
        zf.writestr(
            "data/references.json",
            json.dumps(
                {"references": [dict(r) for r in refs], "reference_tags": [dict(r) for r in ref_tags]},
                indent=2,
                ensure_ascii=False,
            ),
        )

        tags = conn.execute("SELECT * FROM tags ORDER BY name").fetchall()
        note_tags = conn.execute("SELECT * FROM note_tags").fetchall()
        zf.writestr(
            "data/tags.json",
            json.dumps(
                {"tags": [dict(t) for t in tags], "note_tags": [dict(r) for r in note_tags]},
                indent=2,
                ensure_ascii=False,
            ),
        )

        zf.writestr("schema.json", json.dumps(runtime.package.model_dump(mode="json", by_alias=True), indent=2))

    return buf.getvalue()
