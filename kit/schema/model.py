"""Pydantic models for site schema packages (v1.1)."""

from __future__ import annotations

from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class DeploymentConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: str = "local_only"


class SiteConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    port: int = 8770
    subtitle: Optional[str] = None
    deployment: Optional[DeploymentConfig] = None


class StorageConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    local_db: str = "planning.db"
    published_dir: str = "data"
    seed_direction: Optional[str] = None
    export_direction: Optional[str] = None


class FormatConventions(BaseModel):
    model_config = ConfigDict(extra="allow")

    bullet_separator: str = "\x1e"
    projection_separators: Optional[dict[str, str]] = None


class EntityType(BaseModel):
    model_config = ConfigDict(extra="allow")

    primitive: str
    label: str
    label_plural: Optional[str] = None
    table: str
    primary_key: Union[str, list[str]]
    fields: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ProjectionConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    enabled: bool = False
    target_entity: Optional[str] = None
    target_field: Optional[str] = None
    line_format: Optional[str] = None
    optional_meta_format: Optional[str] = None
    sync_triggers: list[str] = Field(default_factory=list)


class JunctionConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    table: str
    keys: list[str]
    foreign_keys: Optional[dict[str, str]] = None


class Relationship(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    from_: str = Field(alias="from")
    to: str
    cardinality: Optional[str] = None
    storage: str
    junction: Optional[JunctionConfig] = None
    projection: Optional[ProjectionConfig] = None
    foreign_key: Optional[dict[str, Any]] = None
    ui: Optional[dict[str, Any]] = None
    export: Optional[dict[str, Any]] = None


class View(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    type: str
    entity: str
    label: str
    primary: bool = False
    container_entity: Optional[str] = None
    columns_from_fields: Optional[list[str]] = None
    sort_by: Optional[str] = None


class Action(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    handler: str
    label: Optional[str] = None
    api: Optional[str] = None
    debounce_ms: Optional[int] = None


class SitePackage(BaseModel):
    """Validated site schema package."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    schema_version: str
    title: Optional[str] = None
    description: Optional[str] = None
    site: SiteConfig
    storage: Optional[StorageConfig] = None
    format_conventions: Optional[FormatConventions] = None
    entity_types: dict[str, EntityType]
    relationships: list[Relationship] = Field(default_factory=list)
    views: list[View] = Field(default_factory=list)
    actions: list[Action] = Field(default_factory=list)
    export_profiles: dict[str, Any] = Field(default_factory=dict)
    validation_rules: list[dict[str, Any]] = Field(default_factory=list)
    seed: Optional[dict[str, Any]] = None

    def entity_ids(self) -> set[str]:
        return set(self.entity_types.keys())

    def get_entity(self, entity_id: str) -> EntityType:
        if entity_id not in self.entity_types:
            raise KeyError(f"Unknown entity: {entity_id}")
        return self.entity_types[entity_id]
