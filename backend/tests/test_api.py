import pytest
from httpx import AsyncClient

from tests.conftest import FRONTEND_URL
from tests.fakes import FakeGenAIClient, FakeMarketBackend


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "active", "version": "1.0.0", "environment": "production"}


# ---- stocks -------------------------------------------------------------------------------


async def test_get_quote(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/AAPL")

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["price"] == 110.0
    assert body["change"] == 10.0
    assert body["change_percent"] == 10.0
    assert body["volume"] == 1_234_567


async def test_symbol_is_normalized_to_upper_case(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/btc-usd")

    assert response.status_code == 200
    assert response.json()["symbol"] == "BTC-USD"


async def test_unknown_symbol_returns_404_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/ZZZZ")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "symbol_not_found", "message": "No se encontró el símbolo «ZZZZ»."}
    }


@pytest.mark.parametrize("symbol", ["TOO-LONG-SYMBOL-123", "AA$PL", "AA PL"])
async def test_malformed_symbol_returns_422(client: AsyncClient, symbol: str) -> None:
    response = await client.get(f"/api/v1/stocks/{symbol}")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_symbol"


async def test_market_outage_returns_502(
    client: AsyncClient, market_backend: FakeMarketBackend
) -> None:
    market_backend.ticker_error = ConnectionError("down")

    response = await client.get("/api/v1/stocks/AAPL")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "market_unavailable"


async def test_get_history(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/AAPL/history", params={"range": "5d"})

    assert response.status_code == 200
    body = response.json()
    assert body["range"] == "5d"
    assert body["interval"] == "30m"
    assert [p["close"] for p in body["points"]] == [100.0, 104.0, 108.0, 110.0]


async def test_history_defaults_to_one_month(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/AAPL/history")

    assert response.json()["range"] == "1mo"


async def test_history_rejects_unknown_range(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/AAPL/history", params={"range": "10y"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_history_unknown_symbol_returns_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/ZZZZ/history")

    assert response.status_code == 404


# ---- sentiment ----------------------------------------------------------------------------


async def test_get_sentiment(client: AsyncClient) -> None:
    response = await client.get("/api/v1/sentiment/AAPL")

    assert response.status_code == 200
    body = response.json()
    assert body["sentiment"] == "bullish"
    assert body["confidence"] == 0.82
    assert body["cached"] is False
    assert body["model"] == "gemini-test"
    assert set(body) == {
        "symbol",
        "sentiment",
        "confidence",
        "justification",
        "key_factors",
        "headlines",
        "model",
        "generated_at",
        "cached",
    }


async def test_fresh_analysis_awards_points_but_cached_does_not(client: AsyncClient) -> None:
    before = (await client.get("/api/v1/gamification/status")).json()["points"]

    await client.get("/api/v1/sentiment/AAPL")
    after_first = (await client.get("/api/v1/gamification/status")).json()["points"]
    cached = (await client.get("/api/v1/sentiment/AAPL")).json()
    after_cached = (await client.get("/api/v1/gamification/status")).json()["points"]

    assert after_first == before + 10
    assert cached["cached"] is True
    assert after_cached == after_first


async def test_refresh_query_bypasses_cache(
    client: AsyncClient, genai_client: FakeGenAIClient
) -> None:
    await client.get("/api/v1/sentiment/AAPL")
    response = await client.get("/api/v1/sentiment/AAPL", params={"refresh": "true"})

    assert response.json()["cached"] is False
    assert len(genai_client.models.calls) == 2


async def test_sentiment_unknown_symbol_returns_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/sentiment/ZZZZ")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "symbol_not_found"


async def test_sentiment_ai_failure_returns_502_without_points(
    client: AsyncClient, genai_client: FakeGenAIClient
) -> None:
    genai_client.models.responses = [ConnectionError("gemini down")]
    before = (await client.get("/api/v1/gamification/status")).json()["points"]

    response = await client.get("/api/v1/sentiment/AAPL")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "ai_unavailable"
    assert (await client.get("/api/v1/gamification/status")).json()["points"] == before


# ---- gamification -------------------------------------------------------------------------


async def test_gamification_status(client: AsyncClient) -> None:
    response = await client.get("/api/v1/gamification/status")

    assert response.status_code == 200
    body = response.json()
    assert body["level_name"] == "Analista"
    assert body["points"] == 120
    assert len(body["badges"]) == 5


# ---- cross-cutting ------------------------------------------------------------------------


async def test_unknown_route_uses_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/nope")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_cors_allows_frontend_origin(client: AsyncClient) -> None:
    response = await client.options(
        "/api/v1/stocks/AAPL",
        headers={"Origin": FRONTEND_URL, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_URL


async def test_cors_rejects_foreign_origin(client: AsyncClient) -> None:
    preflight = await client.options(
        "/api/v1/stocks/AAPL",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
    )
    simple = await client.get("/api/v1/stocks/AAPL", headers={"Origin": "https://evil.example.com"})

    assert preflight.status_code == 400
    assert "access-control-allow-origin" not in simple.headers


async def test_cors_exposes_retry_after(client: AsyncClient) -> None:
    response = await client.get("/api/v1/stocks/AAPL", headers={"Origin": FRONTEND_URL})

    assert response.headers["access-control-expose-headers"] == "Retry-After"


async def test_docs_hidden_in_production(client: AsyncClient) -> None:
    assert (await client.get("/docs")).status_code == 404
