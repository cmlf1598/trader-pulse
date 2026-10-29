from fastapi import APIRouter, Request

from app import __version__
from app.schemas.health import ServiceInfo

router = APIRouter(tags=["health"])


@router.get("/", summary="Service name, version and entry-point links")
async def root(request: Request) -> ServiceInfo:
    docs_url = request.app.docs_url
    return ServiceInfo(
        name="TraderPulse API",
        version=__version__,
        health=str(request.url_for("health")),
        docs=f"{str(request.base_url).rstrip('/')}{docs_url}" if docs_url else None,
    )
