"""Gemini-powered sentiment analysis.

Pipeline: real market data (quote + 1-month history + headlines) → prompt → Gemini with a
structured-output schema → validated `GeminiSentiment`. Successful results are cached for a
short TTL to bound cost; failures are never cached and never replaced with fallback data.
"""

import asyncio
import logging
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from google.genai import errors as genai_errors
from google.genai import types
from pydantic import ValidationError

from app.core.cache import TTLCache
from app.core.errors import (
    AIResponseInvalidError,
    AIServiceError,
    AppError,
    UpstreamRateLimitedError,
    UpstreamTimeoutError,
)
from app.schemas.sentiment import GeminiSentiment, SentimentAnalysis
from app.schemas.stock import Headline, PriceHistory, Quote
from app.services.market_service import MarketService

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """\
You are a senior equity and crypto market analyst. Classify the short-term market sentiment \
(next days to weeks) for one asset as "bullish", "bearish" or "neutral", using ONLY the data \
provided. Weigh recent price action and the tone of the headlines; when evidence is mixed or \
thin, prefer "neutral" with lower confidence. Do not invent facts, prices or news.

Write `justification` and every `key_factors` item in neutral, professional Spanish. Keep \
`justification` under 280 characters and give at most 3 key factors of a few words each. \
This is informational analysis, not financial advice."""


def _fmt(value: float | None, suffix: str = "") -> str:
    return "n/d" if value is None else f"{value:,.4f}{suffix}"


def build_prompt(quote: Quote, history: PriceHistory, headlines: list[Headline]) -> str:
    closes = [point.close for point in history.points]
    first, last = closes[0], closes[-1]
    period_change = (last - first) / first * 100 if first else None
    recent = ", ".join(f"{close:.2f}" for close in closes[-20:])

    news = (
        "\n".join(f"- {h.title}" + (f" ({h.publisher})" if h.publisher else "") for h in headlines)
        or "- No recent headlines available."
    )

    return f"""\
Asset: {quote.symbol} ({quote.exchange or "n/d"}, currency {quote.currency or "n/d"})

Current quote:
- Price: {_fmt(quote.price)}
- Previous close: {_fmt(quote.previous_close)}
- Daily change: {_fmt(quote.change)} ({_fmt(quote.change_percent, "%")})
- Volume: {quote.volume if quote.volume is not None else "n/d"}

Last {history.range} ({len(closes)} closes, interval {history.interval}):
- Period change: {_fmt(period_change, "%")}
- Min / max: {min(closes):.2f} / {max(closes):.2f}
- Most recent closes (oldest → newest): {recent}

Recent headlines:
{news}
"""


class AIService:
    def __init__(
        self,
        *,
        client: Any,
        model: str,
        market: MarketService,
        cache_ttl_seconds: float,
        timeout_seconds: float,
    ):
        self._client = client
        self._model = model
        self._market = market
        self._timeout = timeout_seconds
        self._cache: TTLCache[SentimentAnalysis] = TTLCache(cache_ttl_seconds)
        # One in-flight Gemini call per symbol: concurrent requests wait and then hit the cache.
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @property
    def model(self) -> str:
        return self._model

    async def analyze(self, symbol: str, *, refresh: bool = False) -> SentimentAnalysis:
        key = f"{self._model}:{symbol}"
        if not refresh and (hit := self._cache.get(key)):
            return hit.model_copy(update={"cached": True})

        async with self._locks[key]:
            if not refresh and (hit := self._cache.get(key)):
                return hit.model_copy(update={"cached": True})

            quote, history, headlines = await asyncio.gather(
                self._market.get_quote(symbol),
                self._market.get_history(symbol, "1mo"),
                self._headlines_or_empty(symbol),
            )
            verdict = await self._ask_gemini(build_prompt(quote, history, headlines))

            analysis = SentimentAnalysis(
                symbol=symbol,
                **verdict.model_dump(),
                headlines=headlines,
                model=self._model,
                generated_at=datetime.now(UTC),
                cached=False,
            )
            self._cache.set(key, analysis)
            return analysis

    async def _headlines_or_empty(self, symbol: str) -> list[Headline]:
        # Headlines enrich the analysis but are not required: price action alone is real data.
        # The response lists exactly which headlines were used (possibly none).
        try:
            return await self._market.get_headlines(symbol)
        except AppError as exc:
            logger.warning("Headlines unavailable for %s: %s", symbol, exc.code)
            return []

    async def _ask_gemini(self, prompt: str) -> GeminiSentiment:
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=GeminiSentiment,
            # Gemini 3 is tuned for the default temperature; a low thinking level keeps
            # latency and cost down for this short classification task.
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        )
        try:
            async with asyncio.timeout(self._timeout):
                response = await self._client.aio.models.generate_content(
                    model=self._model, contents=prompt, config=config
                )
        except TimeoutError as exc:
            raise UpstreamTimeoutError("La IA tardó demasiado en responder.") from exc
        except genai_errors.APIError as exc:
            logger.warning("Gemini API error %s %s: %s", exc.code, exc.status, exc.message)
            if exc.code == 429:
                raise UpstreamRateLimitedError(
                    "Se alcanzó el límite de uso de la IA. Inténtalo de nuevo en un minuto."
                ) from exc
            raise AIServiceError() from exc
        except Exception as exc:
            logger.exception("Gemini request failed")
            raise AIServiceError() from exc

        text = getattr(response, "text", None)
        if not text:
            logger.warning("Gemini returned an empty response")
            raise AIResponseInvalidError()
        try:
            return GeminiSentiment.model_validate_json(text)
        except ValidationError as exc:
            logger.warning("Gemini response failed validation: %s", exc)
            raise AIResponseInvalidError() from exc
