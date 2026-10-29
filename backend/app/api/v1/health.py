from fastapi import APIRouter

from app import __version__
from app.api.deps import SettingsDep
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness check (no upstream calls)")
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="active", version=__version__, environment=settings.environment)
