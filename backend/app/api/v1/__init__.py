from fastapi import APIRouter

from app.api.v1 import gamification, health, sentiment, stocks

router = APIRouter(prefix="/api/v1")
router.include_router(health.router)
router.include_router(stocks.router)
router.include_router(sentiment.router)
router.include_router(gamification.router)
