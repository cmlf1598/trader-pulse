"""FastAPI dependencies. Services live on `app.state` (built once in `create_app`)."""

import re
from typing import Annotated

from fastapi import Depends, Path, Request

from app.core.config import Settings
from app.core.errors import InvalidSymbolError
from app.services.ai_service import AIService
from app.services.gamification_service import GamificationService
from app.services.market_service import MarketService

# Letters, digits and the separators Yahoo uses: BRK.B, BTC-USD, EURUSD=X, ^GSPC.
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9.\-=^]{1,15}$")


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_market_service(request: Request) -> MarketService:
    return request.app.state.market_service


def get_ai_service(request: Request) -> AIService:
    return request.app.state.ai_service


def get_gamification_service(request: Request) -> GamificationService:
    return request.app.state.gamification_service


def valid_symbol(
    symbol: Annotated[str, Path(description="Yahoo Finance symbol, e.g. AAPL or BTC-USD.")],
) -> str:
    normalized = symbol.strip().upper()
    if not SYMBOL_PATTERN.fullmatch(normalized):
        raise InvalidSymbolError(symbol)
    return normalized


SettingsDep = Annotated[Settings, Depends(get_settings)]
MarketServiceDep = Annotated[MarketService, Depends(get_market_service)]
AIServiceDep = Annotated[AIService, Depends(get_ai_service)]
GamificationServiceDep = Annotated[GamificationService, Depends(get_gamification_service)]
SymbolDep = Annotated[str, Depends(valid_symbol)]
