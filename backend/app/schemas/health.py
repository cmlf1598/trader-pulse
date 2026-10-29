from typing import Literal

from pydantic import BaseModel

from app.core.config import Environment


class HealthResponse(BaseModel):
    status: Literal["active"]
    version: str
    environment: Environment


class ServiceInfo(BaseModel):
    name: str
    version: str
    health: str
    docs: str | None
