"""Test doubles for yfinance and google-genai. No test in this suite touches the network."""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pandas as pd
from yfinance.exceptions import YFPricesMissingError


def price_frame(closes: Iterable[float], start: datetime | None = None) -> pd.DataFrame:
    closes = list(closes)
    start = start or datetime(2026, 10, 1, 16, 0)
    index = pd.DatetimeIndex(
        [start + timedelta(days=i) for i in range(len(closes))], tz="America/New_York"
    )
    return pd.DataFrame({"Close": closes, "Volume": [1_000] * len(closes)}, index=index)


@dataclass
class FakeTicker:
    """Mimics `yf.Ticker`: `fast_info` raises KeyError on unknown symbols, like yfinance."""

    fast_info: dict[str, Any] = field(default_factory=dict)
    history_frame: pd.DataFrame | None = None
    history_error: Exception | None = None
    history_calls: list[dict[str, Any]] = field(default_factory=list)

    def history(self, **kwargs: Any) -> pd.DataFrame:
        self.history_calls.append(kwargs)
        if self.history_error:
            raise self.history_error
        if self.history_frame is None:
            raise YFPricesMissingError("$UNKNOWN", "")
        return self.history_frame


def listed_ticker(
    price: float = 110.0,
    previous_close: float = 100.0,
    closes: Iterable[float] = (100.0, 104.0, 108.0, 110.0),
) -> FakeTicker:
    return FakeTicker(
        fast_info={
            "last_price": price,
            "previous_close": previous_close,
            "last_volume": 1_234_567,
            "currency": "USD",
            "exchange": "NMS",
        },
        history_frame=price_frame(closes),
    )


class FakeMarketBackend:
    """Ticker/search factories backed by a dict. Unknown symbols behave like Yahoo's 404s."""

    def __init__(self, tickers: dict[str, FakeTicker] | None = None):
        self.tickers = tickers or {}
        self.news: list[dict[str, Any]] = []
        self.search_error: Exception | None = None
        self.ticker_error: Exception | None = None

    def ticker(self, symbol: str) -> FakeTicker:
        if self.ticker_error:
            raise self.ticker_error
        return self.tickers.get(symbol, FakeTicker())

    def search(self, query: str, **_: Any) -> SimpleNamespace:
        if self.search_error:
            raise self.search_error
        return SimpleNamespace(news=self.news)


class FakeModels:
    def __init__(self) -> None:
        self.responses: list[Any] = []
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        result = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(result, BaseException):
            raise result
        return SimpleNamespace(text=result)


class FakeGenAIClient:
    """Exposes `client.aio.models.generate_content(...)` like `google.genai.Client`."""

    def __init__(self, *responses: Any):
        self.models = FakeModels()
        self.models.responses = list(responses)
        self.aio = SimpleNamespace(models=self.models)


BULLISH_JSON = (
    '{"sentiment": "bullish", "confidence": 0.82, '
    '"justification": "El precio sube con fuerza y los titulares son positivos.", '
    '"key_factors": ["Tendencia alcista", "Resultados sólidos"]}'
)
