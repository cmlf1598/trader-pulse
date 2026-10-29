from fastapi import APIRouter

from app.api.deps import GamificationServiceDep
from app.schemas.gamification import GamificationStatus

router = APIRouter(prefix="/gamification", tags=["gamification"])


@router.get("/status", summary="Demo user points, level and badges (in-memory mock)")
async def get_status(gamification: GamificationServiceDep) -> GamificationStatus:
    return gamification.status()
