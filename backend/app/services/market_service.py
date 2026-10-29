"""Yahoo Finance access through `yfinance`.

yfinance is synchronous and talks to unofficial endpoints, so every call:
  * runs in a worker thread (`asyncio.to_thread`) to keep the event loop free,
  * is bounded by a timeout,
  * has its failures translated into domain errors (404 / 502 / 503 / 504). Nothing is ever
    replaced with mock or fallback data.
"""

import asyncio
import logging
import math
import warnings
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import yfinance as yf
from yfinance.exceptions import (
    YFPricesMissingError,
    YFRateLimitError,
    YFTickerMissingError,
    YFTzMissingError,
)

from app.core.errors import (
    AppError,
    MarketDataUnavailableError,
    SymbolNotFoundError,
    UpstreamRateLimitedError,
    UpstreamTimeoutError,
)
from app.schemas.stock import Headline, HistoryRange, PriceHistory, PricePoint, Quote

logger = logging.getLogger(__name__)

# yfinance logs every upstream 404 at ERROR and emits pandas deprecation noise; this module
# reports failures itself.
logging.getLogger("yfinance").setLevel(logging.CRITICAL)
warnings.filterwarnings("ignore", module="yfinance")

type TickerFactory = Callable[[str], Any]
type SearchFactory = Callable[..., Any]

HISTORY_RANGES: dict[str, tuple[str, str]] = {
    "1d": ("1d", "5m"),
    "5d": ("5d", "30m"),
    "1mo": ("1mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y": ("1y", "1wk"),
}

_NOT_FOUND_ERRORS = (YFPricesMissingError, YFTickerMissingError, YFTzMissingError)


def _as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _safe_get(info: Any, key: str) -> Any:
    try:
        return info[key]
    except Exception:
        return None


def _parse_timestamp(value: Any) -> datetime | None:
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, tz=UTC)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def parse_headline(item: dict[str, Any]) -> Headline | None:
    """Normalizes both Yahoo news shapes: flat (search API) and nested under `content`."""
    content = item.get("content") if isinstance(item.get("content"), dict) else item
    title = (content.get("title") or "").strip()
    if not title:
        return None
    provider = content.get("provider") or {}
    url = (
        content.get("link")
        or (content.get("canonicalUrl") or {}).get("url")
        or (content.get("clickThroughUrl") or {}).get("url")
    )
    return Headline(
        title=title,
        publisher=content.get("publisher") or provider.get("displayName"),
        url=url,
        published_at=_parse_timestamp(content.get("providerPublishTime") or content.get("pubDate")),
    )


class MarketService:
    def __init__(
        self,
        *,
        timeout_seconds: float,
        ticker_factory: TickerFactory = yf.Ticker,
        search_factory: SearchFactory = yf.Search,
    ):
        self._timeout = timeout_seconds
        self._ticker = ticker_factory
        self._search = search_factory

    async def get_quote(self, symbol: str) -> Quote:
        return await self._run(self._fetch_quote, symbol)

    async def get_history(self, symbol: str, range_: HistoryRange) -> PriceHistory:
        return await self._run(self._fetch_history, symbol, range_)

    async def get_headlines(self, symbol: str, limit: int = 8) -> list[Headline]:
        return await self._run(self._fetch_headlines, symbol, limit)

    async def _run[T](self, fn: Callable[..., T], *args: Any) -> T:
        try:
            async with asyncio.timeout(self._timeout):
                return await asyncio.to_thread(fn, *args)
        except AppError:
            raise
        except TimeoutError as exc:
            raise UpstreamTimeoutError() from exc
        except YFRateLimitError as exc:
            raise UpstreamRateLimitedError() from exc
        except Exception as exc:
            logger.exception("Yahoo Finance call %s%s failed", fn.__name__, args)
            raise MarketDataUnavailableError() from exc

    def _fetch_quote(self, symbol: str) -> Quote:
        info = self._ticker(symbol).fast_info
        try:
            price = _as_float(info["last_price"])
        except KeyError as exc:
            # Unknown symbols make yfinance raise KeyError('currentTradingPeriod') here.
            raise SymbolNotFoundError(symbol) from exc
        if price is None:
            raise SymbolNotFoundError(symbol)

        previous_close = _as_float(_safe_get(info, "previous_close"))
        change = price - previous_close if previous_close else None
        volume = _as_float(_safe_get(info, "last_volume"))
        return Quote(
            symbol=symbol,
            price=round(price, 4),
            previous_close=round(previous_close, 4) if previous_close else None,
            change=round(change, 4) if change is not None else None,
            change_percent=round(change / previous_close * 100, 4)
            if change is not None and previous_close
            else None,
            volume=int(volume) if volume is not None else None,
            currency=_safe_get(info, "currency"),
            exchange=_safe_get(info, "exchange"),
            as_of=datetime.now(UTC),
        )

    def _fetch_history(self, symbol: str, range_: HistoryRange) -> PriceHistory:
        period, interval = HISTORY_RANGES[range_]
        try:
            frame = self._ticker(symbol).history(
                period=period, interval=interval, raise_errors=True
            )
        except _NOT_FOUND_ERRORS as exc:
            raise SymbolNotFoundError(symbol) from exc

        if frame is None or frame.empty or "Close" not in frame:
            raise SymbolNotFoundError(symbol)

        points = [
            PricePoint(time=timestamp.to_pydatetime(), close=round(close, 4))
            for timestamp, raw in frame["Close"].items()
            if (close := _as_float(raw)) is not None
        ]
        if not points:
            raise SymbolNotFoundError(symbol)
        return PriceHistory(symbol=symbol, range=range_, interval=interval, points=points)

    def _fetch_headlines(self, symbol: str, limit: int) -> list[Headline]:
        # `Ticker.news` depends on an endpoint Yahoo currently answers with 404 (yfinance
        # swallows it and returns []). The search API returns the same articles reliably.
        search = self._search(symbol, max_results=1, news_count=limit, raise_errors=True)
        headlines = [parse_headline(item) for item in (search.news or [])]
        return [headline for headline in headlines if headline is not None][:limit]
