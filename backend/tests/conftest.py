from collections.abc import AsyncIterator, Callable
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from app.services.ai_service import AIService
from app.services.gamification_service import GamificationService
from app.services.market_service import MarketService
from tests.fakes import BULLISH_JSON, FakeGenAIClient, FakeMarketBackend, listed_ticker

FRONTEND_URL = "https://traderpulse.vercel.app"

type SettingsFactory = Callable[..., Settings]


@pytest.fixture
def make_settings() -> SettingsFactory:
    def _make(**overrides: Any) -> Settings:
        # _env_file=None keeps a developer's local backend/.env out of the suite.
        values: dict[str, Any] = {
            "gemini_api_key": "test-key",
            "frontend_url": FRONTEND_URL,
            "environment": "production",
        } | overrides
        return Settings(_env_file=None, **values)

    return _make


@pytest.fixture
def market_backend() -> FakeMarketBackend:
    return FakeMarketBackend(
        {
            "AAPL": listed_ticker(),
            "BTC-USD": listed_ticker(price=80_000, previous_close=82_000),
        }
    )


@pytest.fixture
def market_service(market_backend: FakeMarketBackend) -> MarketService:
    return MarketService(
        timeout_seconds=2,
        ticker_factory=market_backend.ticker,
        search_factory=market_backend.search,
    )


@pytest.fixture
def genai_client() -> FakeGenAIClient:
    return FakeGenAIClient(BULLISH_JSON)


@pytest.fixture
def ai_service(market_service: MarketService, genai_client: FakeGenAIClient) -> AIService:
    return AIService(
        client=genai_client,
        model="gemini-test",
        market=market_service,
        cache_ttl_seconds=600,
        timeout_seconds=2,
    )


@pytest.fixture
def gamification_service() -> GamificationService:
    return GamificationService()


@pytest.fixture
async def client(
    make_settings: SettingsFactory,
    market_service: MarketService,
    ai_service: AIService,
    gamification_service: GamificationService,
) -> AsyncIterator[AsyncClient]:
    app = create_app(
        make_settings(),
        market_service=market_service,
        ai_service=ai_service,
        gamification_service=gamification_service,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c
