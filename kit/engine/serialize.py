"""Field serialization for API ↔ SQLite."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

DEFAULT_BULLET_SEP = "\x1e"
LABEL_VALUE_SEP = " — "
META_SEP = " · "


def bullet_separator(field_def: dict, conventions: Optional[dict] = None) -> str:
    if field_def.get("serialize", {}).get("separator"):
        return field_def["serialize"]["separator"]
    if conventions and conventions.get("bullet_separator"):
        return conventions["bullet_separator"]
    return DEFAULT_BULLET_SEP


def serialize_field(field_def: dict, value: Any, conventions: Optional[dict] = None) -> Any:
    ftype = field_def.get("type", "text")
    if value is None:
        return None
    if ftype == "bullet_list":
        if isinstance(value, list):
            sep = bullet_separator(field_def, conventions)
            return sep.join(str(b).strip() for b in value if str(b).strip())
        return str(value)
    if ftype == "json_array":
        if isinstance(value, (list, dict)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)
    return value


def deserialize_field(field_def: dict, value: Any, conventions: Optional[dict] = None) -> Any:
    if value is None:
        return None
    ftype = field_def.get("type", "text")
    if ftype == "bullet_list":
        text = str(value or "")
        sep = bullet_separator(field_def, conventions)
        if sep in text:
            return [p.strip() for p in text.split(sep) if p.strip()]
        return [line.strip() for line in text.split("\n") if line.strip()]
    if ftype == "json_array":
        try:
            return json.loads(value or "[]")
        except json.JSONDecodeError:
            return []
    if ftype == "integer":
        return int(value) if value is not None and value != "" else None
    if ftype == "number":
        return float(value) if value is not None and value != "" else None
    return value


def row_to_api(entity_fields: dict, row: dict, conventions: Optional[dict] = None) -> dict:
    out = dict(row)
    for name, fdef in entity_fields.items():
        if name in out:
            out[name] = deserialize_field(fdef, out[name], conventions)
    return out


def row_from_api(entity_fields: dict, data: dict, conventions: Optional[dict] = None) -> dict:
    out = {}
    for name, value in data.items():
        if name not in entity_fields:
            continue
        out[name] = serialize_field(entity_fields[name], value, conventions)
    return out


def extract_url(text: str) -> str:
    match = re.search(r"https?://[^\s)]+", text or "")
    return match.group(0).rstrip(")") if match else ""


def normalize_url(url: str) -> str:
    return url.strip().rstrip("/").lower()


def parse_projection_line(line: str, label_sep: str = LABEL_VALUE_SEP) -> tuple[str, str]:
    line = (line or "").strip()
    if not line:
        return "", ""
    idx = line.find(label_sep)
    if idx > 0:
        return line[:idx].strip(), line[idx + len(label_sep) :].strip()
    if line.lower().startswith(("http://", "https://")):
        return "", line
    return line, ""


def format_projection_line(catalog_row: dict, line_format: str, optional_meta_format: Optional[str] = None) -> str:
    line = line_format.format(**{k: catalog_row.get(k, "") for k in catalog_row})
    meta_parts = [catalog_row.get("type"), catalog_row.get("submitted_by")]
    meta = META_SEP.join(p for p in meta_parts if p)
    if meta and optional_meta_format:
        line += optional_meta_format.format(type=meta)
    return line.strip()


def line_matches_catalog(catalog_row: dict, line: str, line_format: str, optional_meta_format: Optional[str] = None) -> bool:
    formatted = format_projection_line(catalog_row, line_format, optional_meta_format)
    if line.strip() == formatted:
        return True
    simple = f"{catalog_row.get('title', '')}{LABEL_VALUE_SEP}{catalog_row.get('link', '')}".strip()
    return line.strip() == simple or line.strip().startswith(simple)
