from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AIServiceDep, GamificationServiceDep, SymbolDep
from app.api.v1.responses import SENTIMENT_ERRORS
from app.schemas.sentiment import SentimentAnalysis

router = APIRouter(prefix="/sentiment", tags=["sentiment"])


@router.get("/{symbol}", summary="AI sentiment analysis (Gemini)", responses=SENTIMENT_ERRORS)
async def get_sentiment(
    symbol: SymbolDep,
    ai: AIServiceDep,
    gamification: GamificationServiceDep,
    refresh: Annotated[bool, Query(description="Bypass the short-lived result cache.")] = False,
) -> SentimentAnalysis:
    analysis = await ai.analyze(symbol, refresh=refresh)
    if not analysis.cached:
        await gamification.record_analysis(symbol)
    return analysis
