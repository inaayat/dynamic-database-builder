"""Load, validate, persist, and patch site schema packages."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Optional

from kit.schema.model import SitePackage

DEFAULT_PACKAGE = "tagged_knowledge_base"
DEFAULTS_DIR = Path(__file__).resolve().parent / "defaults"


class SchemaValidationError(ValueError):
    """Schema failed structural or semantic validation."""


def active_schema_path(root: Path) -> Path:
    return root / "data" / "active-schema.json"


def list_packages() -> list[str]:
    return sorted(p.stem for p in DEFAULTS_DIR.glob("*.json"))


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Deep-merge patch into base; entity_types fields merge per entity."""
    result = copy.deepcopy(base)
    for key, value in patch.items():
        if key == "entity_types" and isinstance(value, dict):
            entities = result.setdefault("entity_types", {})
            for eid, edata in value.items():
                if eid in entities and isinstance(edata, dict):
                    merged = copy.deepcopy(entities[eid])
                    for ek, ev in edata.items():
                        if ek == "fields" and isinstance(ev, dict):
                            merged.setdefault("fields", {}).update(copy.deepcopy(ev))
                        elif isinstance(ev, dict) and isinstance(merged.get(ek), dict):
                            merged[ek] = {**merged[ek], **copy.deepcopy(ev)}
                        else:
                            merged[ek] = copy.deepcopy(ev)
                    entities[eid] = merged
                else:
                    entities[eid] = copy.deepcopy(edata)
        elif (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
            and key not in ("relationships", "views", "actions", "validation_rules")
        ):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


class SchemaLoader:
    def __init__(
        self,
        root: Optional[Path] = None,
        package_name: str = DEFAULT_PACKAGE,
    ) -> None:
        self.root = root or Path.cwd()
        self.package_name = package_name
        self._package: Optional[SitePackage] = None
        self._raw: Optional[dict[str, Any]] = None
        self._source: str = "default"

    @property
    def package(self) -> SitePackage:
        if self._package is None:
            self.load()
        assert self._package is not None
        return self._package

    @property
    def raw(self) -> dict[str, Any]:
        if self._raw is None:
            self.load()
        assert self._raw is not None
        return self._raw

    @property
    def source(self) -> str:
        if self._raw is None:
            self.load()
        return self._source

    def package_path(self) -> Path:
        path = DEFAULTS_DIR / f"{self.package_name}.json"
        if not path.is_file():
            raise FileNotFoundError(f"Schema package not found: {path}")
        return path

    def _read_json(self, path: Path) -> dict[str, Any]:
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def _write_active(self, data: dict[str, Any]) -> Path:
        path = active_schema_path(self.root)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        return path

    def load_from_data(self, data: dict[str, Any], source: str = "memory") -> SitePackage:
        package = SitePackage.model_validate(data)
        self.validate_semantics(package)
        self._raw = data
        self._package = package
        self._source = source
        return package

    def load(self) -> SitePackage:
        active = active_schema_path(self.root)
        if active.is_file():
            data = self._read_json(active)
            return self.load_from_data(data, source="active")

        data = self._read_json(self.package_path())
        self._write_active(data)
        return self.load_from_data(data, source="default")

    def reload(self) -> SitePackage:
        self._package = None
        self._raw = None
        return self.load()

    def save(self, data: dict[str, Any]) -> SitePackage:
        package = self.load_from_data(data, source="active")
        self._write_active(data)
        return package

    def patch(self, partial: dict[str, Any]) -> SitePackage:
        merged = deep_merge(self.raw, partial)
        return self.save(merged)

    def load_package(self, package_id: str) -> SitePackage:
        path = DEFAULTS_DIR / f"{package_id}.json"
        if not path.is_file():
            raise FileNotFoundError(f"Schema package not found: {package_id}")
        data = self._read_json(path)
        self.package_name = package_id
        return self.save(data)

    def to_json(self) -> dict[str, Any]:
        return copy.deepcopy(self.raw)

    @staticmethod
    def validate(data: dict[str, Any]) -> dict[str, Any]:
        """Dry-run validation; returns errors and warnings without raising."""
        errors: list[str] = []
        warnings: list[str] = []

        try:
            package = SitePackage.model_validate(data)
        except Exception as exc:
            return {"valid": False, "errors": [str(exc)], "warnings": warnings}

        try:
            SchemaLoader.validate_semantics(package)
        except SchemaValidationError as exc:
            errors.append(str(exc))
        except Exception as exc:
            errors.append(str(exc))

        for entity_id, entity in package.entity_types.items():
            if not entity.fields:
                warnings.append(f"Entity {entity_id!r} has no fields defined")

        return {
            "valid": not errors,
            "errors": errors,
            "warnings": warnings,
        }

    @staticmethod
    def validate_semantics(package: SitePackage) -> None:
        errors: list[str] = []
        entity_ids = package.entity_ids()

        for rel in package.relationships:
            if rel.from_ not in entity_ids:
                errors.append(f"Relationship {rel.id!r}: unknown from entity {rel.from_!r}")
            if rel.to not in entity_ids:
                errors.append(f"Relationship {rel.id!r}: unknown to entity {rel.to!r}")

            if rel.projection and rel.projection.enabled:
                target = rel.projection.target_entity
                field = rel.projection.target_field
                if not target or target not in entity_ids:
                    errors.append(
                        f"Relationship {rel.id!r}: projection target_entity {target!r} missing"
                    )
                elif field and field not in package.get_entity(target).fields:
                    errors.append(
                        f"Relationship {rel.id!r}: projection target_field {field!r} "
                        f"not on entity {target!r}"
                    )

            if rel.storage == "junction" and rel.junction is None:
                errors.append(f"Relationship {rel.id!r}: junction storage requires junction config")

        for view in package.views:
            if view.entity not in entity_ids:
                errors.append(f"View {view.id!r}: unknown entity {view.entity!r}")
            if view.container_entity and view.container_entity not in entity_ids:
                errors.append(
                    f"View {view.id!r}: unknown container_entity {view.container_entity!r}"
                )

        if errors:
            raise SchemaValidationError("; ".join(errors))


_loader: Optional[SchemaLoader] = None


def get_loader(
    root: Optional[Path] = None,
    package_name: str = DEFAULT_PACKAGE,
) -> SchemaLoader:
    global _loader
    root = root or Path.cwd()
    if _loader is None or _loader.root != root or _loader.package_name != package_name:
        _loader = SchemaLoader(root=root, package_name=package_name)
        _loader.load()
    return _loader


def reset_loader() -> None:
    global _loader
    _loader = None
