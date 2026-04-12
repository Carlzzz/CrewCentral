from pydantic import BaseModel, Field, model_validator


class SkillUploadMeta(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    version: str = Field(..., min_length=1, max_length=32)
    description: str | None = None
    category: str = Field(default="custom", max_length=32)
    platforms: list[str] = Field(default_factory=list)
    changelog: str | None = None
    icon_url: str | None = None


class ToggleDispatchBody(BaseModel):
    enabled: bool
    scope: str = Field(..., pattern="^(all_devices|group_only)$")
    group_id: str | None = None


class AssignmentSkillConfig(BaseModel):
    skill_id: str
    enabled: bool
    config: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def config_object_only(self):
        if not isinstance(self.config, dict):
            raise ValueError("config must be object")
        return self


class AssignmentUpdateBody(BaseModel):
    target_type: str = Field(..., pattern="^(user|group)$")
    target_id: str = Field(..., min_length=1, max_length=64)
    skills: list[AssignmentSkillConfig] = Field(default_factory=list)


class ManifestSkill(BaseModel):
    skill_slug: str
    name: str
    version: str
    description: str | None = None
    package_hash: str
    config: dict = Field(default_factory=dict)


class DownloadTokenBody(BaseModel):
    device_uuid: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)
