# TraderPulse: System Architecture

This document describes TraderPulse **as a system**: how the two apps and the external providers fit together, how a request flows end to end, and the cross-cutting decisions behind them. Each app's internals are covered in its own architecture guide:

- [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md): layers, error mapping, sentiment pipeline, caching.
- [frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md): RSC shell, client islands, SWR data flow, state.

---

## 1. System context

```mermaid
flowchart LR
    User(["👤 Investor<br/>(browser)"])

    subgraph Vercel["Vercel"]
        FE["TraderPulse Frontend<br/>Next.js 16 · static RSC shell<br/>+ client islands (SWR)"]
    end

    subgraph GCP["Google Cloud Run"]
        BE["TraderPulse API<br/>FastAPI · Python 3.12"]
    end

    Yahoo[("Yahoo Finance<br/>quotes · history · news")]
    Gemini[("Google Gemini API<br/>gemini-3-flash-preview")]

    User -- "1 · HTML/JS (static shell)" --> FE
    User -- "2 · JSON over HTTPS<br/>(CORS: FRONTEND_URL only)" --> BE
    BE -- "yfinance (worker threads)" --> Yahoo
    BE -- "google-genai (structured output)" --> Gemini
```

Two independently deployed apps:

| App | Runs on | Responsibility |
|---|---|---|
| **Frontend** | Vercel (static and edge-cached) | Renders the dashboard. All live data is fetched **from the browser** with SWR. |
| **Backend** | Cloud Run (container) | The only component that talks to Yahoo Finance and Gemini. It holds the API key and maps upstream failures to HTTP errors. |

The browser calls the API **directly** (`NEXT_PUBLIC_API_URL`). This is why the backend enforces a strict CORS allow-list. See [ADR-002](#adr-002-browser-calls-the-api-directly-strict-cors).

## 2. Containers and responsibilities

```mermaid
flowchart TB
    subgraph Browser
        Shell["Static shell (Server Component)<br/>header · layout · footer"]
        Islands["Client island: &lt;Dashboard/&gt;<br/>TickerTape · PriceChart · SentimentWidget<br/>WatchlistGrid · GamificationSidebar"]
        SWR["SWR cache<br/>keys: quote · history · sentiment · gamification"]
        Toasts["Sonner toasts"]
        Shell --> Islands --> SWR
        SWR -- "onError" --> Toasts
    end

    subgraph API["FastAPI (Cloud Run)"]
        Routes["/api/v1 routes<br/>stocks · sentiment · gamification · health"]
        Market["MarketService<br/>(yfinance, to_thread, timeouts)"]
        AI["AIService<br/>(prompt → Gemini → validated JSON,<br/>TTL cache, per-symbol lock)"]
        Game["GamificationService<br/>(in-memory demo profile)"]
        Errors["Error handlers<br/>{error:{code,message}}"]
        Routes --> Market
        Routes --> AI --> Market
        Routes --> Game
        Market -. domain errors .-> Errors
        AI -. domain errors .-> Errors
    end

    SWR -- "GET /api/v1/…" --> Routes
```

## 3. End-to-end flow: clicking a ticker

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant T as TickerTape
    participant D as Dashboard (useWatchlist)
    participant S as SWR cache
    participant A as FastAPI
    participant Y as Yahoo Finance
    participant G as Gemini

    U->>T: click "TSLA"
    T->>D: select("TSLA") → new immutable state
    D->>S: PriceChart: useQuote(TSLA) + useHistory(TSLA, 1mo)
    D->>S: SentimentWidget: useSentiment(TSLA)
    S->>A: GET /stocks/TSLA (cached from ticker, deduped)
    S->>A: GET /stocks/TSLA/history?range=1mo
    A->>Y: history(period=1mo, interval=1d)
    Y-->>A: closes
    A-->>S: 200 PriceHistory
    S->>A: GET /sentiment/TSLA
    alt cached < 10 min
        A-->>S: 200 {…, cached: true}
    else fresh analysis
        par
            A->>Y: fast_info (quote)
        and
            A->>Y: history 1mo
        and
            A->>Y: search news (best effort)
        end
        A->>G: generate_content(prompt, response_schema=GeminiSentiment)
        G-->>A: JSON verdict
        A->>A: validate · cache · +10 points
        A-->>S: 200 {…, cached: false}
        S->>A: revalidate GET /gamification/status
    end
    S-->>U: chart + color-coded verdict render
```

## 4. Error propagation

```mermaid
flowchart LR
    subgraph Upstream
        Y1["Yahoo: unknown symbol<br/>(KeyError / empty history)"]
        Y2["Yahoo: rate limit"]
        Y3["Yahoo/Gemini: slow"]
        Y4["Yahoo: any other failure"]
        G1["Gemini: 4xx/5xx/network"]
        G2["Gemini: invalid JSON / schema"]
        G3["Gemini: 429"]
    end
    subgraph Backend["Domain errors → HTTP"]
        E404["404 symbol_not_found"]
        E503["503 rate_limited + Retry-After"]
        E504["504 upstream_timeout"]
        E502m["502 market_unavailable"]
        E502a["502 ai_unavailable"]
        E502i["502 ai_invalid_response"]
    end
    subgraph Frontend
        AE["ApiError(status, code, message)"]
        Toast["Sonner toast (Spanish message,<br/>deduplicated per SWR key)"]
        Inline["Inline error state in the widget"]
        Retry["onErrorRetry: no retry on 4xx,<br/>backoff / Retry-After on 5xx"]
    end
    Y1 --> E404
    Y2 --> E503
    G3 --> E503
    Y3 --> E504
    Y4 --> E502m
    G1 --> E502a
    G2 --> E502i
    E404 & E503 & E504 & E502m & E502a & E502i --> AE --> Toast
    AE --> Inline
    AE --> Retry
```

## 5. Data freshness

| Data | Source | Frontend refresh | Backend cache |
|---|---|---|---|
| Quote | `Ticker.fast_info` | every 60s (`NEXT_PUBLIC_POLL_INTERVAL_MS`) | none |
| Intraday history (1D, 5D) | `Ticker.history` | every 60s | none |
| Long history (1M, 6M, 1A) | `Ticker.history` | every 5 min | none |
| Sentiment | Gemini + quote, history and news | **not polled**: runs on symbol change or "Reanalizar" | 10 min TTL (successes only) |
| Gamification | in-memory store | every 60s, plus after each fresh analysis | n/a |

## 6. Security model

- **Secrets stay server-side.** `GEMINI_API_KEY` exists only in the backend's environment (Cloud Run env or Secret Manager), as a `SecretStr` that is never logged or serialized. The frontend env contains only `NEXT_PUBLIC_*` values, which are public by definition.
- **CORS is strict.** In production the allow-list is exactly `FRONTEND_URL` (normalized to its origin), with `GET` only and no credentials. Development additionally allows `localhost:3000` and `127.0.0.1:3000`.
- **Input validation.** Symbols are validated by regex, and query parameters by FastAPI and Pydantic (`range` is a `Literal`).
- **No user data.** There is no authentication and no PII. The gamification profile is a single demo user in memory.
- **Docs are hidden in production.** `/docs` and `/openapi.json` are disabled when `ENVIRONMENT=production`.

## 7. Deployment topology

```mermaid
flowchart LR
    Dev["Developer"] -- git push --> Repo[("Git repository")]
    Repo -- "Vercel Git integration<br/>(Root Directory: frontend)" --> V["Vercel<br/>static shell + JS bundles"]
    Repo -- "docker build backend/<br/>(target: runtime)" --> AR[("Artifact Registry")]
    AR --> CR["Cloud Run service<br/>ENVIRONMENT=production<br/>FRONTEND_URL=https://…vercel.app<br/>GEMINI_API_KEY (secret)"]
    V -. "NEXT_PUBLIC_API_URL=https://…run.app<br/>(inlined at build time)" .-> CR
```

Deploy the backend first, because the frontend needs its URL at build time. Then set `FRONTEND_URL` on Cloud Run to the Vercel production URL. Step-by-step instructions are in [backend/ONBOARDING.md → Deploying](backend/ONBOARDING.md#8-deploying-to-google-cloud-run) and [frontend/ONBOARDING.md → Deploying](frontend/ONBOARDING.md#8-deploying-to-vercel). The live environment, redeploy commands and smoke tests are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 8. Key Architectural Decisions (cross-cutting ADRs)

App-specific ADRs, such as *Why FastAPI?* and *Why SWR?*, live in the spoke architecture docs. These are the decisions that shape **both** apps.

### ADR-001: Decoupled frontend and backend

**Decision.** There are two independent apps, with their own dependencies, tests, linters, Dockerfiles and deploy targets.
**Why.**
- Each half uses the best runtime for its job. Python has first-class finance and AI SDKs (`yfinance`, `google-genai`), and Next.js gives Vercel a fast static shell.
- They scale and release independently, so a prompt tweak redeploys only Cloud Run.
- Secrets stay isolated in the backend.

**Trade-off.** There are two pipelines and a contract to keep in sync. The shared error envelope and the mirrored Zod schemas make that contract explicit and testable.

### ADR-002: Browser calls the API directly (strict CORS)

**Decision.** Client components fetch `NEXT_PUBLIC_API_URL` directly. The backend is the only CORS-enabled origin, and it allows `FRONTEND_URL` exclusively.
**Why.**
- Real-time polling from many widgets is cheapest as direct browser→API traffic. It avoids a Vercel function invocation per poll and an extra network hop.
- The frontend can then be fully static (`○ /` in the build output).
- CORS becomes a real, tested boundary rather than an unused setting.

**Alternatives considered.** A BFF: Next.js route handlers or Server Actions proxying to FastAPI. It would hide the API URL and let us add server-side auth later, but it costs a hop and server compute on every 60s poll. If TraderPulse adds user accounts, revisit this and put authenticated calls behind a BFF.

### ADR-003: No mock or fallback data for market & AI

**Decision.** If Yahoo Finance or Gemini fails, or a symbol doesn't exist, the API returns the corresponding HTTP error **immediately**. It never returns stale, synthetic or default values. The frontend surfaces every error with a Sonner toast.
**Why.** In a financial tool, a plausible but fake number is worse than an error: users can act on it. Explicit errors are also debuggable and observable.
**Nuances (still compliant):**
- The **sentiment cache** reuses a *real, successful* analysis for up to 10 minutes, labeled `cached: true` and "En caché" in the UI. Failures are never cached.
- **Headlines are best effort.** If the news lookup fails, the analysis proceeds on real price data, and `headlines: []` shows exactly what was used. The quote and history remain mandatory.
- **Gamification** is the one explicitly mocked layer (an in-memory demo profile), as the spec allows.

### ADR-004: Gemini 3 Flash with structured output

**Decision.** Use `gemini-3-flash-preview` by default, configurable via `GEMINI_MODEL`. Request `response_mime_type="application/json"` with a Pydantic `response_schema`, then re-validate locally.
**Why.**
- Flash-class models are fast and cheap enough for interactive use.
- Structured output removes brittle text parsing, and local validation guarantees the API contract even if the model drifts.
- A low thinking level keeps latency down for a short classification task.

**Risk.** It is a **Preview** model, which Google may retire on short notice. Mitigation: switch to the stable `gemini-3.8-flash` (or newer) by changing one env var, with no code change.

### ADR-005: Validate configuration at startup on both sides

**Decision.**
- **Backend:** Pydantic Settings validates `GEMINI_API_KEY` (required, non-blank), `FRONTEND_URL` (URL, https in production), `PORT` and timeouts before uvicorn binds. Invalid configuration exits with code 1.
- **Frontend:** Zod validates `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POLL_INTERVAL_MS` from `next.config.ts`, so `next dev` and `next build` fail on bad values.

**Why.** Configuration bugs should fail the deploy, not the user. Cloud Run keeps serving the previous healthy revision when a new one can't boot, and Vercel never promotes a failed build. `NEXT_PUBLIC_*` values are frozen into the bundle at build time, which makes build-time validation the only place to catch them.

### ADR-006: One error envelope, Spanish messages from the server

**Decision.** All errors use `{"error": {"code", "message"}}`, where `message` is already Spanish UI copy.
**Why.** There is a single source of truth for user-facing copy per failure, and new error types appear correctly in the UI without a frontend release. The frontend keeps `FALLBACK_MESSAGES` only for non-envelope failures, such as network errors or proxy HTML pages.
