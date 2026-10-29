import asyncio
import time
from datetime import UTC, datetime

import pytest
from yfinance.exceptions import YFRateLimitError

from app.core.errors import (
    MarketDataUnavailableError,
    SymbolNotFoundError,
    UpstreamRateLimitedError,
    UpstreamTimeoutError,
)
from app.services.market_service import MarketService, parse_headline
from tests.fakes import FakeMarketBackend, FakeTicker, listed_ticker, price_frame


async def test_quote_computes_change_from_previous_close(market_service: MarketService) -> None:
    quote = await market_service.get_quote("AAPL")

    assert quote.symbol == "AAPL"
    assert quote.price == 110.0
    assert quote.previous_close == 100.0
    assert quote.change == 10.0
    assert quote.change_percent == 10.0
    assert quote.volume == 1_234_567
    assert quote.currency == "USD"
    assert quote.as_of.tzinfo is UTC


async def test_quote_without_previous_close_has_no_change(
    market_backend: FakeMarketBackend, market_service: MarketService
) -> None:
    market_backend.tickers["NEW"] = FakeTicker(fast_info={"last_price": 5.0})

    quote = await market_service.get_quote("NEW")

    assert quote.price == 5.0
    assert quote.change is None
    assert quote.change_percent is None
    assert quote.volume is None


async def test_unknown_symbol_raises_not_found(market_service: MarketService) -> None:
    with pytest.raises(SymbolNotFoundError, match="ZZZZ"):
        await market_service.get_quote("ZZZZ")


@pytest.mark.parametrize("price", [None, float("nan"), "n/a"])
async def test_missing_price_is_not_found(
    market_backend: FakeMarketBackend, market_service: MarketService, price: object
) -> None:
    market_backend.tickers["DEAD"] = FakeTicker(fast_info={"last_price": price})

    with pytest.raises(SymbolNotFoundError):
        await market_service.get_quote("DEAD")


async def test_rate_limit_maps_to_rate_limited(
    market_backend: FakeMarketBackend, market_service: MarketService
) -> None:
    market_backend.ticker_error = YFRateLimitError()

    with pytest.raises(UpstreamRateLimitedError) as exc_info:
        await market_service.get_quote("AAPL")
    assert exc_info.value.headers["Retry-After"] == "60"


async def test_unexpected_failure_maps_to_unavailable(
    market_backend: FakeMarketBackend, market_service: MarketService
) -> None:
    market_backend.ticker_error = ConnectionError("network down")

    with pytest.raises(MarketDataUnavailableError):
        await market_service.get_quote("AAPL")


async def test_slow_upstream_times_out() -> None:
    def slow_ticker(_: str) -> FakeTicker:
        time.sleep(0.3)
        return listed_ticker()

    service = MarketService(timeout_seconds=0.05, ticker_factory=slow_ticker)

    with pytest.raises(UpstreamTimeoutError):
        await service.get_quote("AAPL")
    await asyncio.sleep(0.3)  # let the worker thread finish before the loop closes


@pytest.mark.parametrize(
    ("range_", "period", "interval"),
    [("1d", "1d", "5m"), ("1mo", "1mo", "1d"), ("1y", "1y", "1wk")],
)
async def test_history_maps_range_to_period_and_interval(
    market_backend: FakeMarketBackend,
    market_service: MarketService,
    range_: str,
    period: str,
    interval: str,
) -> None:
    history = await market_service.get_history("AAPL", range_)  # type: ignore[arg-type]

    assert history.range == range_
    assert history.interval == interval
    assert [p.close for p in history.points] == [100.0, 104.0, 108.0, 110.0]
    assert market_backend.tickers["AAPL"].history_calls[-1] == {
        "period": period,
        "interval": interval,
        "raise_errors": True,
    }


async def test_history_skips_nan_closes(
    market_backend: FakeMarketBackend, market_service: MarketService
) -> None:
    market_backend.tickers["GAP"] = FakeTicker(history_frame=price_frame([1.0, float("nan"), 3.0]))

    history = await market_service.get_history("GAP", "5d")

    assert [p.close for p in history.points] == [1.0, 3.0]


async def test_history_for_unknown_symbol_is_not_found(market_service: MarketService) -> None:
    with pytest.raises(SymbolNotFoundError):
        await market_service.get_history("ZZZZ", "1mo")


async def test_empty_history_is_not_found(
    market_backend: FakeMarketBackend, market_service: MarketService
) -> None:
    market_backend.tickers["EMPTY"] = FakeTicker(history_frame=price_frame([]))

    with pytest.raises(SymbolNotFoundError):
        await market_service.get_history("EMPTY", "1mo")


async def test_headlines_are_normalized_and_limited(
    market_backend: FakeMarketBackend, market_service: MarketService
) -> None:
    market_backend.news = [
        {"title": f"Headline {i}", "publisher": "Reuters", "link": f"https://x/{i}"}
        for i in range(10)
    ] + [{"title": "  "}]

    headlines = await market_service.get_headlines("AAPL", limit=3)

    assert [h.title for h in headlines] == ["Headline 0", "Headline 1", "Headline 2"]


def test_parse_headline_flat_shape() -> None:
    headline = parse_headline(
        {
            "title": "Apple sube",
            "publisher": "Reuters",
            "link": "https://example.com/a",
            "providerPublishTime": 1_793_229_221,
        }
    )

    assert headline is not None
    assert headline.publisher == "Reuters"
    assert headline.url == "https://example.com/a"
    assert headline.published_at == datetime.fromtimestamp(1_793_229_221, tz=UTC)


def test_parse_headline_nested_content_shape() -> None:
    headline = parse_headline(
        {
            "id": "1",
            "content": {
                "title": "Bitcoin cae",
                "provider": {"displayName": "Yahoo Finance"},
                "canonicalUrl": {"url": "https://example.com/b"},
                "pubDate": "2026-10-28T12:00:00Z",
            },
        }
    )

    assert headline is not None
    assert headline.publisher == "Yahoo Finance"
    assert headline.url == "https://example.com/b"
    assert headline.published_at == datetime(2026, 10, 28, 12, tzinfo=UTC)


def test_parse_headline_without_title_is_dropped() -> None:
    assert parse_headline({"content": {"title": ""}}) is None
