# Backend Onboarding: TraderPulse API

This guide is everything you need to be productive on the FastAPI service: running it, where each piece lives and why, how to make common changes, and how to debug and deploy.

← [Hub](../ONBOARDING.md) · [Backend README (API reference)](README.md) · [Backend architecture](ARCHITECTURE.md)

---

## 1. Quick start

```bash
cd backend
cp .env.example .env            # Windows: Copy-Item .env.example .env
# edit .env → GEMINI_API_KEY=<your key>
uv sync                         # Python 3.12 + deps into .venv (reads .python-version + uv.lock)
uv run python -m app            # → http://localhost:8080  (docs: /docs)
```

Smoke-test it:

```bash
curl localhost:8080/api/v1/health
curl localhost:8080/api/v1/stocks/AAPL
curl "localhost:8080/api/v1/stocks/BTC-USD/history?range=5d"
curl localhost:8080/api/v1/sentiment/NVDA          # calls Gemini (~2–6 s on first call)
curl localhost:8080/api/v1/sentiment/NVDA          # instant, "cached": true
curl localhost:8080/api/v1/stocks/ZZZZZZ           # 404 symbol_not_found
```

Before committing, run the quality gate: `uv run ruff check . && uv run ruff format --check . && uv run pytest`.

---

## 2. Project structure deep dive

```
backend/
├── app/
│   ├── __init__.py            # __version__ (reported by /health)
│   ├── __main__.py            # `python -m app`: validate settings → uvicorn on $PORT
│   ├── main.py                # create_app() factory: services, CORS, error handlers, routers, lifespan
│   ├── core/                  # cross-cutting infrastructure (no business logic)
│   │   ├── config.py          # Settings (pydantic-settings): env validation, CORS origins
│   │   ├── errors.py          # AppError hierarchy + exception handlers → error envelope
│   │   └── cache.py           # TTLCache: tiny in-process TTL + LRU cache
│   ├── api/                   # HTTP layer: thin, declarative
│   │   ├── deps.py            # Depends() providers: settings, services, valid_symbol
│   │   └── v1/
│   │       ├── __init__.py    # mounts all v1 routers under /api/v1
│   │       ├── health.py      # GET /health
│   │       ├── stocks.py      # GET /stocks/{symbol}, /stocks/{symbol}/history
│   │       ├── sentiment.py   # GET /sentiment/{symbol} (awards points on fresh analyses)
│   │       ├── gamification.py# GET /gamification/status
│   │       └── responses.py   # OpenAPI docs for error responses
│   ├── services/              # business logic + provider integrations
│   │   ├── market_service.py  # yfinance wrapper: quotes, history, headlines; error translation
│   │   ├── ai_service.py      # prompt building, Gemini call, validation, cache, per-symbol lock
│   │   └── gamification_service.py  # in-memory demo profile, levels, badges
│   └── schemas/               # Pydantic models = the public API contract
│       ├── stock.py           # Quote, PriceHistory, PricePoint, Headline, HistoryRange
│       ├── sentiment.py       # GeminiSentiment (model schema) + SentimentAnalysis (API response)
│       ├── gamification.py    # GamificationStatus, Badge
│       ├── health.py          # HealthResponse
│       └── error.py           # ErrorResponse (OpenAPI documentation of the envelope)
├── tests/
│   ├── fakes.py               # FakeTicker, FakeMarketBackend, FakeGenAIClient, fixtures
│   ├── conftest.py            # Settings/services/app fixtures + httpx AsyncClient
│   └── test_*.py              # one file per service + config + API
├── pyproject.toml             # deps, dev group, pytest + ruff config
├── uv.lock                    # pinned dependency graph (commit it)
├── .python-version            # 3.12 (uv uses it; Docker base image matches)
├── .env.example               # documented env template (copy to .env)
├── Dockerfile                 # builder / dev / runtime stages
└── .dockerignore
```

### What goes where?

| Folder | Put here | Never put here |
|---|---|---|
| `core/` | Generic infrastructure reused by everything: config, errors, cache | Anything that knows about stocks or AI |
| `api/` | Routing, parameter parsing, dependency wiring, OpenAPI metadata | Business rules, provider calls, try/except around upstreams |
| `services/` | Provider integrations and business logic; translate provider exceptions to `AppError`s | FastAPI imports (`Request`, `HTTPException`) |
| `schemas/` | Pydantic models for requests and responses (the contract) | Behaviour beyond simple validators |

### Key files explained

- **`main.py`**: `create_app(settings=None, *, market_service=None, ai_service=None, gamification_service=None)` builds the app. In production all services are constructed from settings; tests inject fakes through the keyword arguments. Services live on `app.state`, and `api/deps.py` exposes them through `Depends`.
- **`__main__.py`**: loads `Settings` first. On a `ValidationError` it prints a readable message and exits 1, so a misconfigured Cloud Run revision never takes traffic. Otherwise it starts uvicorn with `factory=True`, proxy headers enabled, and the server header off.
- **`core/errors.py`**: each `AppError` subclass carries `status_code`, `code` and a Spanish `message`. The handlers also wrap FastAPI's own validation errors and Starlette's 404 and 405 into the same envelope.
- **`services/market_service.py`**: every public method runs its sync worker via `_run()`, which is where `asyncio.to_thread`, `asyncio.timeout` and exception translation happen. Yahoo quirks are documented inline. For example, unknown symbols raise `KeyError('currentTradingPeriod')` from `fast_info`, and `Ticker.news` currently hits a 404 endpoint, so headlines come from `yf.Search`.
- **`services/ai_service.py`**: `analyze(symbol, refresh=False)` runs the cache check, then the per-symbol lock, then `gather(quote, history, headlines)`, then `build_prompt`, then Gemini, then validation, then the cache write.

---

## 3. Common workflows

### 3.1 Add an endpoint (end to end)

Example: `GET /api/v1/stocks/{symbol}/profile` returning sector and industry.

1. **Schema.** Add the response model to `app/schemas/stock.py`:
   ```python
   class Profile(BaseModel):
       symbol: str
       sector: str | None
       industry: str | None
   ```
2. **Service.** Add a public async method and a private sync worker to `MarketService`. Raise domain errors, and don't catch broadly. `_run` translates everything else.
   ```python
   async def get_profile(self, symbol: str) -> Profile:
       return await self._run(self._fetch_profile, symbol)


   def _fetch_profile(self, symbol: str) -> Profile:
       info = self._ticker(symbol).info
       if not info or info.get("quoteType") is None:
           raise SymbolNotFoundError(symbol)
       return Profile(symbol=symbol, sector=info.get("sector"), industry=info.get("industry"))
   ```
3. **Route.** Add it to `app/api/v1/stocks.py`. Reuse `SymbolDep` for validation and normalization, and `MARKET_ERRORS` for OpenAPI:
   ```python
   @router.get("/{symbol}/profile", summary="Company profile", responses=MARKET_ERRORS)
   async def get_profile(symbol: SymbolDep, market: MarketServiceDep) -> Profile:
       return await market.get_profile(symbol)
   ```
   A brand-new router file must also be included in `app/api/v1/__init__.py`.
4. **Fake.** If the service uses a new provider attribute (`info`), add it to `FakeTicker` in `tests/fakes.py`.
5. **Tests.** Add service tests (happy path, not found, outage) to `test_market_service.py`, and endpoint tests (status codes, body, envelope) to `test_api.py`.
6. **Contract.** Add the Zod schema and an `api.profile()` call in `frontend/src/lib/api/` (see the [frontend workflow](../frontend/ONBOARDING.md#32-consume-a-new-endpoint)).
7. **Docs.** Add the endpoint to the [API reference](README.md#api-reference).

### 3.2 Add a configuration setting

1. Add a typed field with validation to `Settings` in `app/core/config.py`, e.g. `news_limit: int = Field(default=8, ge=1, le=20)`.
2. Document it in `.env.example` and the [configuration table](README.md#configuration).
3. Pass it to the service in `create_app()`. Services receive plain values, not the `Settings` object.
4. Add a validation test to `tests/test_config.py`.

### 3.3 Add an error type

1. Subclass `AppError` in `app/core/errors.py` with `status_code`, a stable snake_case `code` and a Spanish `message`.
2. Raise it from a service. The global handler renders it automatically.
3. Add it to the error table in [README](README.md#error-envelope) and to `responses.py` if it applies to a route group.
4. Optionally add a fallback message to `frontend/src/lib/api/errors.ts` (`FALLBACK_MESSAGES`).

### 3.4 Change the Gemini model or prompt

- **Model:** set `GEMINI_MODEL` in `.env` or on Cloud Run. No code change is needed. The cache key includes the model, so switching never serves another model's result.
- **Prompt:** edit `SYSTEM_INSTRUCTION` or `build_prompt()` in `app/services/ai_service.py`. Keep three things true:
  - All inputs are real data that was passed in. Never ask the model to "recall" prices.
  - Output fields stay in Spanish.
  - The schema in `GeminiSentiment` stays the source of truth. Field descriptions are part of the prompt.
- **Schema:** adding a field to `GeminiSentiment` also requires adding it to `SentimentAnalysis` and to the frontend `sentimentSchema`.
- Verify with `uv run pytest tests/test_ai_service.py`, then with a real call: `curl "localhost:8080/api/v1/sentiment/AAPL?refresh=true"`.

### 3.5 Add a new service

Create `app/services/<name>_service.py` with a class that receives its dependencies through `__init__`. Construct it in `create_app()` (with an injectable keyword argument), store it on `app.state`, add a `get_<name>_service` provider and `<Name>ServiceDep` alias in `api/deps.py`, and add a fixture in `tests/conftest.py`.

### 3.6 Dependencies

```bash
uv add <package>            # runtime dependency (updates pyproject.toml + uv.lock)
uv add --dev <package>      # dev-only dependency
uv lock --upgrade-package yfinance   # bump one package
```

Commit both `pyproject.toml` and `uv.lock`. The Dockerfile uses `uv sync --frozen`, which fails if they disagree.

---

## 4. Running with Docker

```bash
# Production image (what Cloud Run runs)
docker build -t traderpulse-api .
docker run --rm -p 8080:8080 --env-file .env -e ENVIRONMENT=development traderpulse-api

# Dev image with hot reload (what docker-compose uses)
docker compose up backend        # from the repo root
```

---

## 5. Testing

```bash
uv run pytest                        # all (≈1 s)
uv run pytest tests/test_api.py -k cors -vv
uv run pytest --lf                   # only last failures
```

**Principles:**
- **No network.** `tests/fakes.py` replaces the provider *factories* that services receive: `ticker_factory` and `search_factory` for yfinance, and `client` for genai. Services are tested through their real code paths, including `to_thread` and timeouts.
- `FakeTicker.fast_info` is a plain dict, so a missing `last_price` raises `KeyError` exactly like yfinance does for unknown symbols. Unknown symbols in `FakeMarketBackend` raise `YFPricesMissingError` from `history()`.
- `FakeGenAIClient(*responses)` returns each response in order and repeats the last one. A response can be a JSON string or an exception instance to raise. Inspect `client.models.calls` to assert on the prompt and config.
- `make_settings(**overrides)` builds `Settings(_env_file=None, ...)`, so your local `.env` never leaks into tests.
- `pytest-asyncio` runs in `auto` mode, so `async def test_…` just works.

---

## 6. Debugging

### VS Code

Open the repository root in VS Code and select the Python interpreter at `backend/.venv`.

| Launch config (`.vscode/launch.json`) | Use it for |
|---|---|
| **Backend: FastAPI (debugpy)** | Breakpoints in routes and services. Uses `backend/.env`, port 8080, auto-reload. |
| **Backend: Pytest (current file)** | Step through a failing test (`-x -vv`). |
| **Full stack: Backend + Frontend** | Backend plus `npm run dev` together. |

`justMyCode` is `false`, so you can step into `yfinance` and `google-genai` internals.

### Useful techniques

- **See exactly what Gemini receives.** Set a breakpoint in `AIService._ask_gemini`, or temporarily `logger.info(prompt)` in `analyze()`. You can also run the pipeline in a REPL:
  ```bash
  uv run python -c "import asyncio; from app.main import create_app; app = create_app(); print(asyncio.run(app.state.ai_service.analyze('AAPL')).model_dump_json(indent=2))"
  ```
- **Inspect raw Yahoo data:**
  ```bash
  uv run python -c "import yfinance as yf; t = yf.Ticker('AAPL'); print(dict(t.fast_info)); print(t.history(period='5d').tail())"
  ```
- **yfinance debug logging.** `market_service.py` silences the `yfinance` logger. Call `yf.enable_debug_mode()` in a REPL to see every HTTP request.
- **Logs.** Domain errors are logged by the exception handlers: client errors at INFO and upstream failures at WARNING, with the provider message (e.g. `Gemini API error 400 INVALID_ARGUMENT: API key not valid`). Unexpected Yahoo exceptions are logged with a full traceback.
- **Try endpoints interactively** at <http://localhost:8080/docs>.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Invalid configuration, refusing to start` | Read the listed fields. Usually `GEMINI_API_KEY` or `FRONTEND_URL` is missing from `.env`. |
| `FRONTEND_URL must use https when ENVIRONMENT=production` | Use the `https://` Vercel URL in production. |
| Every sentiment call returns `502 ai_unavailable` | Check the log line `Gemini API error …`. Typical causes are an invalid key (400), a model not enabled for the key (404), or a revoked key (403). |
| `503 rate_limited` from sentiment | Gemini quota (429). Wait, or raise `SENTIMENT_CACHE_TTL_SECONDS`. |
| Quotes are stale outside market hours | That's expected: Yahoo returns the last trade. Crypto trades 24/7. |
| `headlines: []` in sentiment | The news search failed or returned nothing. The analysis still uses real price data (see the log warning `Headlines unavailable`). |
| `uv sync --frozen` fails in Docker | `uv.lock` is out of date. Run `uv lock` and commit it. |

---

## 8. Deploying to Google Cloud Run

One-time setup:

```bash
PROJECT_ID=ai-native-dev-513023 REGION=northamerica-south1 REPO=traderpulse
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION
gcloud iam service-accounts create traderpulse-api-sa
SA=traderpulse-api-sa@$PROJECT_ID.iam.gserviceaccount.com
printf '%s' "<your-gemini-key>" | gcloud secrets create traderpulse-gemini-key --data-file=-
gcloud secrets add-iam-policy-binding traderpulse-gemini-key \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
```

Build and deploy (from `backend/`):

```bash
TAG=$(date +%Y%m%d-%H%M%S)
gcloud builds submit --config cloudbuild.yaml --substitutions=_TAG=$TAG .
gcloud run deploy traderpulse-api \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/traderpulse-api:$TAG \
  --region $REGION --service-account $SA --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production,FRONTEND_URL=https://traderpulse-ten.vercel.app \
  --set-secrets GEMINI_API_KEY=traderpulse-gemini-key:latest \
  --cpu 1 --memory 512Mi
```

The live environment and post-deploy smoke tests are in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

Notes:
- `cloudbuild.yaml` builds the `runtime` target with BuildKit; `.gcloudignore` keeps `.env` and `.venv/` out of the uploaded source.
- Cloud Run injects `PORT`, and `python -m app` honours it.
- If settings are invalid, the new revision fails to start and traffic stays on the previous healthy revision.
- `--min-instances 1` avoids cold starts and keeps the in-memory sentiment cache and gamification profile warm. Both are **per instance**; see [ARCHITECTURE → ADR-B7](ARCHITECTURE.md#adr-b7-in-memory-gamification-store).
- After deploying, set `NEXT_PUBLIC_API_URL` on Vercel to the service URL and redeploy the frontend.
