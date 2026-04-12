from pydantic import BaseModel, Field


class DeviceRegisterBody(BaseModel):
    device_uuid: str = Field(..., min_length=1)
    name: str | None = None
    mac_address: str | None = Field(default=None, min_length=1)
    os_version: str | None = Field(default=None, min_length=1)
    client_version: str | None = Field(default=None, min_length=1)
    hardware: dict | None = None


class DeviceHeartbeatBody(BaseModel):
    device_uuid: str = Field(..., min_length=1)
    current_skill_slug: str | None = None
