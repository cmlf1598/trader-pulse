# Onboarding: TraderPulse Developer Handbook (Hub)

Welcome! This is the **hub** of the handbook. It gets you from zero to a running stack, explains the conventions shared by both apps, and points you to the right **spoke** guide for deeper work.

| If you want to… | Read |
|---|---|
| Understand the whole system first | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Work on the API, Yahoo Finance or Gemini integration | [backend/ONBOARDING.md](backend/ONBOARDING.md) → [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) |
| Work on the dashboard UI, charts or data hooks | [docs/frontend/ONBOARDING.md](docs/frontend/ONBOARDING.md) → [docs/frontend/ARCHITECTURE.md](docs/frontend/ARCHITECTURE.md) |
| Look up an endpoint or error code | [backend/README.md](backend/README.md#api-reference) |
| Look up a component or hook | [docs/frontend/README.md](docs/frontend/README.md#component-library) |

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **uv** | ≥ 0.9 | Python package and interpreter manager. It installs Python 3.12 for you. |
| **Python** | 3.12 | Managed by uv through `backend/.python-version`. No system install is needed. |
| **Node.js** | 24 LTS | Comes with npm ≥ 11. |
| **Docker Desktop** | optional | Only needed for the `docker compose` workflow and for building the Cloud Run image. |
| **VS Code** | recommended | The repo ships `.vscode/launch.json` and extension recommendations. |
| **Gemini API key** | required | Free tier available. See below. |

```bash
# uv: macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```powershell
# uv: Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Install Node 24 from <https://nodejs.org>, or with a version manager: `fnm install 24`, `nvm install 24` or `volta install node@24`.

### Getting a Gemini API key

1. Open <https://aistudio.google.com/apikey> and sign in.
2. **Create API key** and copy it.
3. Put it **only** in `backend/.env` as `GEMINI_API_KEY=...`. Never commit it, and never put it in any frontend file. Everything in the frontend's env ends up in the browser bundle.

---

## 2. Quick start (≈ 5 minutes)

### Option A: Docker Compose (both services, hot reload)

```bash
cd trader-pulse
cp backend/.env.example backend/.env      # edit: GEMINI_API_KEY=<your key>
docker compose up --build
```

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8080/api/v1/health>, with interactive docs at <http://localhost:8080/docs>
- Editing `backend/app/**` reloads uvicorn, and editing `src/**` triggers Next.js Fast Refresh.

### Option B: Native (fastest feedback, best for debugging)

```bash
# Terminal 1: backend
cd trader-pulse/backend
cp .env.example .env                       # Windows: Copy-Item .env.example .env ; then set GEMINI_API_KEY
uv sync                                    # creates .venv with Python 3.12 + all deps
uv run python -m app                       # http://localhost:8080
```

```bash
# Terminal 2: frontend
cd trader-pulse
cp .env.example .env.local                 # NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev                                # http://localhost:3000
```

### Verify it works

```bash
curl http://localhost:8080/api/v1/health          # {"status":"active",...}
curl http://localhost:8080/api/v1/stocks/AAPL     # live quote from Yahoo Finance
curl http://localhost:8080/api/v1/stocks/ZZZZZZ   # 404 {"error":{"code":"symbol_not_found",...}}
```

In the browser, check four things:
1. The ticker tape moves.
2. Clicking **TSLA** in the tape retargets the chart and the AI widget.
3. Typing `ZZZZZZ` in the search box shows the toast **"Símbolo no encontrado: ZZZZZZ"**.
4. The sentiment widget shows a colored verdict. If it shows *"El análisis de IA no está disponible"*, your `GEMINI_API_KEY` is missing or invalid; see the backend log.

---

## 3. Shared conventions

### Language

| Where | Language |
|---|---|
| UI text, toasts, API error `message` fields, AI justification | **Spanish** |
| Code, identifiers, comments, commit messages, docs, log lines | **English** |

### The error contract (both apps depend on it)

Every backend failure returns the same envelope. `code` is a stable machine-readable string, and `message` is Spanish copy that is safe to show directly in a toast.

```json
{ "error": { "code": "symbol_not_found", "message": "No se encontró el símbolo «ZZZZ»." } }
```

| HTTP | `code` | When |
|---|---|---|
| 404 | `symbol_not_found` | Yahoo Finance has no data for the symbol |
| 422 | `invalid_symbol`, `validation_error` | Malformed symbol or query parameter |
| 502 | `market_unavailable` | Yahoo Finance failed |
| 502 | `ai_unavailable`, `ai_invalid_response` | Gemini failed or returned an unusable payload |
| 503 | `rate_limited` | Upstream rate limit; the response carries a `Retry-After` header |
| 504 | `upstream_timeout` | Yahoo Finance or Gemini didn't answer in time |

**Golden rule: no mock or fallback data for market or AI.** If a provider fails, the API fails loudly with one of these codes and the UI shows a toast. The only mocked data in the system is the gamification store; see [ARCHITECTURE.md → ADR-003](ARCHITECTURE.md#adr-003-no-mock-or-fallback-data-for-market--ai).

### Symbols

Yahoo Finance symbols are upper-cased and validated against `^[A-Z0-9.\-=^]{1,15}$` on **both** sides: `backend/app/api/deps.py` and `src/lib/symbols.ts`. Crypto uses the `-USD` suffix (`BTC-USD`), FX uses `=X` (`EURUSD=X`), and indices use `^` (`^GSPC`).

### Code quality

| | Lint | Format | Types | Tests |
|---|---|---|---|---|
| Backend | `uv run ruff check .` | `uv run ruff format .` | type hints everywhere (Pydantic enforces at runtime) | `uv run pytest` |
| Frontend | `npm run lint` (ESLint) | `npm run format` (Prettier + Tailwind class sorting) | `npm run typecheck` | `npm test` (Vitest) |

Run the full gate for the app you touched before opening a PR (see [README → Quality gates](README.md#-quality-gates)). Tests never hit the network: Yahoo and Gemini are always faked.

### Contracts that must change together

When you change a response model in `backend/app/schemas/*.py`, update the matching Zod schema in `src/lib/api/schemas.ts` in the same PR. If you don't, the frontend rejects the response as `invalid_response`. That is intentional: drift gets caught instead of rendering garbage.

---

## 4. Debugging (overview)

Open the **`trader-pulse/`** folder in VS Code and use the *Run and Debug* panel:

| Configuration | What it does |
|---|---|
| **Backend: FastAPI (debugpy)** | Runs uvicorn under the debugger with `backend/.env` loaded. Breakpoints work in routes and services. |
| **Backend: Pytest (current file)** | Debugs the open test file. |
| **Frontend: Next.js (server-side)** | Runs `npm run dev` in a debug terminal for Server Component breakpoints. |
| **Frontend: Next.js (client-side, Edge/Chrome)** | Opens a browser attached to VS Code for breakpoints in client components and hooks. |
| **Frontend: Vitest (current file)** | Debugs the open test file. |
| **Full stack: Backend + Frontend** | Compound config that starts both. |

App-specific tips (yfinance debug mode, inspecting the Gemini prompt, SWR cache inspection) are in each spoke's ONBOARDING guide.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Backend exits with `Invalid configuration, refusing to start … gemini_api_key Field required` | Create `backend/.env` and set `GEMINI_API_KEY`. |
| `next dev`/`next build` fails with `Invalid environment variables … NEXT_PUBLIC_API_URL` | Create `.env.local` from `.env.example`. |
| Browser console: *blocked by CORS policy* | The page origin must match `FRONTEND_URL` in `backend/.env` exactly. In development, `localhost:3000` and `127.0.0.1:3000` are always allowed. |
| Every card shows "sin datos" and a network toast | The backend isn't running, or `NEXT_PUBLIC_API_URL` points to the wrong place. |
| Sentiment shows "El análisis de IA no está disponible" | Invalid or expired key, or the model isn't enabled for your key. The backend log shows the exact Gemini error. |
| `503 rate_limited` | Yahoo or Gemini throttled you. Wait a minute; the UI backs off automatically using `Retry-After`. |
| Compose: frontend doesn't hot-reload on Windows or macOS | It relies on polling (`WATCHPACK_POLLING=true`, already set). Make sure the bind mount is working (`docker compose exec frontend ls /app/src`). |
