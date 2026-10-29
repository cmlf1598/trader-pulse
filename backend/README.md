# TraderPulse API (backend)

FastAPI service that wraps **Yahoo Finance** (via `yfinance`) and **Gemini 3 Flash** (via `google-genai`) for the TraderPulse dashboard. It is the only component that holds secrets or talks to external providers.

← Back to the [hub](../ONBOARDING.md) · How to work on it: [ONBOARDING.md](ONBOARDING.md) · How it is built: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Features

- **Real-time quotes** from `Ticker.fast_info`: price, previous close, absolute and percent change, volume, currency and exchange.
- **Historical closes** for charts in five ranges (`1d`, `5d`, `1mo`, `6mo`, `1y`) with sensible intervals. NaN rows are dropped.
- **AI sentiment analysis.** The quote, one month of closes and up to 8 recent headlines go to Gemini with a structured-output schema. The response is `bullish` / `bearish` / `neutral` with a confidence score, a Spanish justification of at most 280 characters, and up to 3 key factors.
- **Cost controls for AI.** A 10-minute in-memory cache stores successful analyses (`?refresh=true` bypasses it). A per-symbol lock means concurrent requests share one Gemini call.
- **Gamification (mock).** An in-memory demo profile with levels, points and badges. Each fresh analysis earns +10 points.
- **Strict error contract.** There is never fallback data. Every failure maps to a precise status and stable `code`, with a Spanish `message` for the UI.
- **Fail-fast configuration.** The process refuses to start without `GEMINI_API_KEY` or `FRONTEND_URL`.
- **Strict CORS.** Production allows only `FRONTEND_URL`, with `GET` only and no credentials.
- **Non-blocking I/O.** Blocking yfinance calls run in worker threads with timeouts. Gemini uses the async client.
- **Production-ready container.** Multi-stage `python:3.12-slim` image that runs as a non-root user and honours `$PORT` for Cloud Run.

## Commands

```bash
uv sync                          # install (creates .venv on Python 3.12)
uv run python -m app             # run (validates settings, then uvicorn on $PORT)
uv run uvicorn app.main:create_app --factory --reload --port 8080   # dev with reload
uv run pytest                    # tests (offline: Yahoo and Gemini are faked)
uv run ruff check .              # lint
uv run ruff format .             # format
docker build -t traderpulse-api .                # Cloud Run image (target: runtime)
docker build --target dev -t traderpulse-api:dev .   # hot-reload image used by compose
```

## Configuration

All settings are environment variables, validated by `app/core/config.py` at startup. In local development they're read from `backend/.env` through python-dotenv; real environment variables always win.

| Variable | Required | Default | Validation / notes |
|---|---|---|---|
| `GEMINI_API_KEY` | **yes** | none | Non-blank. Stored as `SecretStr`, never logged. |
| `FRONTEND_URL` | **yes** | none | Absolute http(s) URL, normalized to an origin. **https required in production.** |
| `ENVIRONMENT` | no | `development` | `development` or `production`. Production hides `/docs` and drops the localhost CORS origins. |
| `GEMINI_MODEL` | no | `gemini-3-flash-preview` | Any Gemini model id, e.g. the stable `gemini-3.8-flash`. |
| `PORT` | no | `8080` | 1–65535. Cloud Run injects it. |
| `SENTIMENT_CACHE_TTL_SECONDS` | no | `600` | ≥ 0. `0` disables the cache. |
| `UPSTREAM_TIMEOUT_SECONDS` | no | `15` | Each Yahoo or Gemini call, 0–120. |

---

## API reference

Base path: **`/api/v1`** (plus the `GET /` index). All responses are JSON. Interactive OpenAPI docs are at `/docs` (development only).

### Error envelope

Every non-2xx response has this shape:

```json
{ "error": { "code": "symbol_not_found", "message": "No se encontró el símbolo «ZZZZ»." } }
```

| HTTP | `code` | Meaning |
|---|---|---|
| 404 | `symbol_not_found` | Yahoo Finance has no data for the symbol |
| 404 | `not_found` | Unknown route |
| 405 | `method_not_allowed` | The API is GET-only |
| 422 | `invalid_symbol` | Symbol fails `^[A-Z0-9.\-=^]{1,15}$` after upper-casing |
| 422 | `validation_error` | A query parameter is invalid (e.g. `range=10y`) |
| 502 | `market_unavailable` | Yahoo Finance failed |
| 502 | `ai_unavailable` | Gemini failed: invalid key, 4xx/5xx or network |
| 502 | `ai_invalid_response` | Gemini returned empty or schema-violating JSON |
| 503 | `rate_limited` | Yahoo or Gemini throttled the request; see the `Retry-After` header (seconds) |
| 504 | `upstream_timeout` | Yahoo or Gemini exceeded `UPSTREAM_TIMEOUT_SECONDS` |

### `GET /`

Service index, so the bare service URL answers with something useful. Links are absolute; `docs` is `null` in production.

```json
{
  "name": "TraderPulse API",
  "version": "1.0.0",
  "health": "https://traderpulse-api-549697455926.northamerica-south1.run.app/api/v1/health",
  "docs": null
}
```

### `GET /api/v1/health`

Liveness check, with no upstream calls. Used by the compose healthcheck and Cloud Run.

```json
{ "status": "active", "version": "1.0.0", "environment": "development" }
```

### `GET /api/v1/stocks/{symbol}`

Real-time quote. `symbol` is case-insensitive: `aapl`, `BTC-USD`, `EURUSD=X`, `%5EGSPC` (`^GSPC`).

```bash
curl http://localhost:8080/api/v1/stocks/AAPL
```

```json
{
  "symbol": "AAPL",
  "price": 343.83,
  "previous_close": 347.1077,
  "change": -3.2777,
  "change_percent": -0.9443,
  "volume": 34405006,
  "currency": "USD",
  "exchange": "NMS",
  "as_of": "2026-10-28T23:33:39.333866Z"
}
```

`previous_close`, `change`, `change_percent`, `volume`, `currency` and `exchange` can be `null` when Yahoo doesn't provide them. `as_of` is the server time of the fetch, in UTC. Errors: 404, 422, 502, 503, 504.

### `GET /api/v1/stocks/{symbol}/history?range=1mo`

Historical closes for charting.

| `range` | Yahoo period | Interval |
|---|---|---|
| `1d` | 1d | 5m |
| `5d` | 5d | 30m |
| `1mo` (default) | 1mo | 1d |
| `6mo` | 6mo | 1d |
| `1y` | 1y | 1wk |

```json
{
  "symbol": "AAPL",
  "range": "5d",
  "interval": "30m",
  "points": [
    { "time": "2026-10-22T09:30:00-04:00", "close": 345.63 },
    { "time": "2026-10-22T10:00:00-04:00", "close": 343.275 }
  ]
}
```

`time` is ISO 8601 in the exchange's timezone. Errors: 404, 422 (bad symbol or range), 502, 503, 504.

### `GET /api/v1/sentiment/{symbol}?refresh=false`

AI sentiment analysis. Successful results are cached for `SENTIMENT_CACHE_TTL_SECONDS`, and `refresh=true` forces a new Gemini call. A **fresh** (non-cached) success awards +10 gamification points.

```json
{
  "symbol": "AAPL",
  "sentiment": "bullish",
  "confidence": 0.72,
  "justification": "El precio rebota con volumen creciente y los titulares sobre resultados son positivos.",
  "key_factors": ["Rebote técnico", "Resultados sólidos", "Volumen al alza"],
  "headlines": [
    { "title": "Apple beats estimates…", "publisher": "Reuters", "url": "https://…", "published_at": "2026-10-28T12:00:00Z" }
  ],
  "model": "gemini-3-flash-preview",
  "generated_at": "2026-10-28T23:40:02.118Z",
  "cached": false
}
```

- `sentiment` is one of `bullish`, `bearish` or `neutral`. The UI shows them as Alcista, Bajista and Neutral.
- `confidence` is between 0 and 1.
- `headlines` lists exactly the headlines sent to the model, and may be empty if the news lookup failed.

Errors: 404 (unknown symbol; Gemini is not called), 422, 502 (`market_unavailable`, `ai_unavailable` or `ai_invalid_response`), 503, 504.

### `GET /api/v1/gamification/status`

The demo user's progress. In-memory: it resets on restart and is per instance.

```json
{
  "points": 120,
  "level": 2,
  "level_name": "Analista",
  "current_level_points": 50,
  "next_level_points": 150,
  "progress": 0.7,
  "analyses_count": 9,
  "badges": [
    { "id": "first_analysis", "name": "Primer análisis", "description": "Solicita tu primer análisis de sentimiento.", "earned": true },
    { "id": "consistent", "name": "Analista constante", "description": "Completa 10 análisis de sentimiento.", "earned": false }
  ]
}
```

| Level | Name | Points from |
|---|---|---|
| 1 | Novato | 0 |
| 2 | Analista | 50 |
| 3 | Estratega | 150 |
| 4 | Experto | 300 |
| 5 | Leyenda | 600 (`next_level_points: null`, `progress: 1`) |

Badges: `first_analysis` (≥ 1 analysis), `consistent` (≥ 10), `explorer` (≥ 5 distinct symbols), `crypto_curious` (any `-USD` symbol) and `strategist` (≥ 150 points).

---

## Testing

There are 86 tests in `tests/`, and none of them use the network.

| File | Covers |
|---|---|
| `test_market_service.py` | Quote math, NaN or missing data → 404, rate limit, outage, timeout, history range mapping, NaN filtering, both news shapes |
| `test_ai_service.py` | Structured parsing, cache hit, refresh and no caching of failures, a single Gemini call under concurrency, Gemini error mapping, invalid payloads, 404 before Gemini, best-effort headlines, trimming |
| `test_gamification_service.py` | Seeded profile, points, level thresholds, max level, badge unlocking, seed isolation |
| `test_config.py` | Required `GEMINI_API_KEY` and `FRONTEND_URL`, blank key, env parsing, secret not leaked, https in production, port bounds, CORS origins |
| `test_api.py` | Every endpoint and status code, error envelope, symbol normalization, points awarded only on fresh analyses, CORS allow and deny, `Retry-After` exposure, docs hidden in production |

How the fakes work is explained in [ONBOARDING.md → Testing](ONBOARDING.md#5-testing).
