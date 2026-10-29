from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import MarketServiceDep, SymbolDep
from app.api.v1.responses import MARKET_ERRORS
from app.schemas.stock import HistoryRange, PriceHistory, Quote

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/{symbol}", summary="Real-time quote", responses=MARKET_ERRORS)
async def get_quote(symbol: SymbolDep, market: MarketServiceDep) -> Quote:
    return await market.get_quote(symbol)


@router.get("/{symbol}/history", summary="Historical closes for charts", responses=MARKET_ERRORS)
async def get_history(
    symbol: SymbolDep,
    market: MarketServiceDep,
    range_: Annotated[HistoryRange, Query(alias="range")] = "1mo",
) -> PriceHistory:
    return await market.get_history(symbol, range_)
