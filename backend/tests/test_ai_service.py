import asyncio

import pytest
from google.genai import errors as genai_errors

from app.core.errors import (
    AIResponseInvalidError,
    AIServiceError,
    MarketDataUnavailableError,
    SymbolNotFoundError,
    UpstreamRateLimitedError,
)
from app.services.ai_service import AIService, build_prompt
from app.services.market_service import MarketService
from tests.fakes import BULLISH_JSON, FakeGenAIClient, FakeMarketBackend


def api_error(code: int, status: str) -> genai_errors.APIError:
    cls = genai_errors.ClientError if code < 500 else genai_errors.ServerError
    return cls(code, {"error": {"code": code, "message": "boom", "status": status}})


async def test_analyze_returns_structured_sentiment(
    ai_service: AIService, genai_client: FakeGenAIClient, market_backend: FakeMarketBackend
) -> None:
    market_backend.news = [{"title": "Apple bate expectativas", "publisher": "Reuters"}]

    analysis = await ai_service.analyze("AAPL")

    assert analysis.symbol == "AAPL"
    assert analysis.sentiment == "bullish"
    assert analysis.confidence == 0.82
    assert analysis.key_factors == ["Tendencia alcista", "Resultados sólidos"]
    assert [h.title for h in analysis.headlines] == ["Apple bate expectativas"]
    assert analysis.model == "gemini-test"
    assert analysis.cached is False

    call = genai_client.models.calls[0]
    assert call["model"] == "gemini-test"
    assert call["config"].response_mime_type == "application/json"
    assert "Apple bate expectativas" in call["contents"]
    assert "AAPL" in call["contents"]


async def test_second_call_is_served_from_cache(
    ai_service: AIService, genai_client: FakeGenAIClient
) -> None:
    await ai_service.analyze("AAPL")
    second = await ai_service.analyze("AAPL")

    assert second.cached is True
    assert len(genai_client.models.calls) == 1


async def test_refresh_bypasses_cache(ai_service: AIService, genai_client: FakeGenAIClient) -> None:
    await ai_service.analyze("AAPL")
    refreshed = await ai_service.analyze("AAPL", refresh=True)

    assert refreshed.cached is False
    assert len(genai_client.models.calls) == 2


async def test_concurrent_requests_share_one_gemini_call(
    ai_service: AIService, genai_client: FakeGenAIClient
) -> None:
    results = await asyncio.gather(*(ai_service.analyze("AAPL") for _ in range(3)))

    assert len(genai_client.models.calls) == 1
    assert sorted(r.cached for r in results) == [False, True, True]


async def test_failures_are_not_cached(
    ai_service: AIService, genai_client: FakeGenAIClient
) -> None:
    genai_client.models.responses = [api_error(500, "INTERNAL"), BULLISH_JSON]

    with pytest.raises(AIServiceError):
        await ai_service.analyze("AAPL")
    analysis = await ai_service.analyze("AAPL")

    assert analysis.cached is False
    assert len(genai_client.models.calls) == 2


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (api_error(429, "RESOURCE_EXHAUSTED"), UpstreamRateLimitedError),
        (api_error(400, "INVALID_ARGUMENT"), AIServiceError),
        (api_error(403, "PERMISSION_DENIED"), AIServiceError),
        (api_error(503, "UNAVAILABLE"), AIServiceError),
        (ConnectionError("dns"), AIServiceError),
    ],
)
async def test_gemini_errors_are_mapped(
    ai_service: AIService,
    genai_client: FakeGenAIClient,
    error: Exception,
    expected: type[Exception],
) -> None:
    genai_client.models.responses = [error]

    with pytest.raises(expected):
        await ai_service.analyze("AAPL")


@pytest.mark.parametrize(
    "payload",
    [
        "",
        "not json",
        '{"sentiment": "euphoric", "confidence": 0.5, "justification": "x"}',
        '{"sentiment": "bullish", "confidence": 1.5, "justification": "x"}',
        '{"sentiment": "bullish", "confidence": 0.5, "justification": ""}',
    ],
)
async def test_invalid_gemini_payload_is_rejected(
    ai_service: AIService, genai_client: FakeGenAIClient, payload: str
) -> None:
    genai_client.models.responses = [payload]

    with pytest.raises(AIResponseInvalidError):
        await ai_service.analyze("AAPL")


async def test_unknown_symbol_fails_before_calling_gemini(
    ai_service: AIService, genai_client: FakeGenAIClient
) -> None:
    with pytest.raises(SymbolNotFoundError):
        await ai_service.analyze("ZZZZ")

    assert genai_client.models.calls == []


async def test_missing_headlines_do_not_block_analysis(
    ai_service: AIService, genai_client: FakeGenAIClient, market_backend: FakeMarketBackend
) -> None:
    market_backend.search_error = ConnectionError("search down")

    analysis = await ai_service.analyze("AAPL")

    assert analysis.headlines == []
    assert "No recent headlines available." in genai_client.models.calls[0]["contents"]


async def test_market_outage_propagates(
    ai_service: AIService, genai_client: FakeGenAIClient, market_backend: FakeMarketBackend
) -> None:
    market_backend.ticker_error = ConnectionError("yahoo down")

    with pytest.raises(MarketDataUnavailableError):
        await ai_service.analyze("AAPL")
    assert genai_client.models.calls == []


async def test_long_justification_and_extra_factors_are_trimmed(
    ai_service: AIService, genai_client: FakeGenAIClient
) -> None:
    genai_client.models.responses = [
        '{"sentiment": "neutral", "confidence": 0.4, '
        f'"justification": "{"a" * 600}", "key_factors": ["a", "b", " ", "c", "d"]}}'
    ]

    analysis = await ai_service.analyze("AAPL")

    assert len(analysis.justification) == 400
    assert analysis.justification.endswith("…")
    assert analysis.key_factors == ["a", "b", "c"]


async def test_prompt_contains_market_context(market_service: MarketService) -> None:
    quote = await market_service.get_quote("AAPL")
    history = await market_service.get_history("AAPL", "1mo")

    prompt = build_prompt(quote, history, [])

    assert "Price: 110.0000" in prompt
    assert "Period change: 10.0000%" in prompt
    assert "100.00, 104.00, 108.00, 110.00" in prompt
