"""Load and validate site schema packages."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from kit.schema.model import SitePackage

DEFAULT_PACKAGE = "tagged_knowledge_base"
DEFAULTS_DIR = Path(__file__).resolve().parent / "defaults"


class SchemaValidationError(ValueError):
    """Schema failed structural or semantic validation."""


class SchemaLoader:
    def __init__(self, package_name: str = DEFAULT_PACKAGE) -> None:
        self.package_name = package_name
        self._package: Optional[SitePackage] = None
        self._raw: Optional[dict[str, Any]] = None

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

    def package_path(self) -> Path:
        path = DEFAULTS_DIR / f"{self.package_name}.json"
        if not path.is_file():
            raise FileNotFoundError(f"Schema package not found: {path}")
        return path

    def load(self) -> SitePackage:
        path = self.package_path()
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        package = SitePackage.model_validate(data)
        self.validate_semantics(package)
        self._raw = data
        self._package = package
        return package

    def reload(self) -> SitePackage:
        self._package = None
        self._raw = None
        return self.load()

    def to_json(self) -> dict[str, Any]:
        return self.raw

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


def get_loader(package_name: str = DEFAULT_PACKAGE) -> SchemaLoader:
    global _loader
    if _loader is None or _loader.package_name != package_name:
        _loader = SchemaLoader(package_name)
        _loader.load()
    return _loader
