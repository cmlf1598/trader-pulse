# TraderPulse Frontend

Next.js 16 dashboard (Spanish UI, dark theme) for real-time market analysis. It renders a static Server Component shell and hydrates one client island that polls the TraderPulse API with SWR.

← Back to the [hub](../ONBOARDING.md) · How to work on it: [ONBOARDING.md](ONBOARDING.md) · How it is built: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Features

- **Ticker tape.** An infinite, seamless marquee of live quotes that pauses on hover or focus and respects `prefers-reduced-motion`. Clicking a symbol retargets the chart and the AI widget.
- **Watchlist grid.** Responsive cards (1–4 columns) with price, daily change, absolute variation, compact volume and a 5-day sparkline. Each card can be selected or removed.
- **Symbol search.** Accepts any Yahoo symbol (normalized to upper case). It validates locally, then **confirms with the backend** before adding. Unknown symbols raise the toast "Símbolo no encontrado: XYZ".
- **Price chart.** Recharts area chart with 1D / 5D / 1M / 6M / 1A ranges, Spanish-locale axes and tooltip, and a gradient that is green or red by period trend.
- **AI sentiment widget.** Gemini verdict color-coded as Alcista (emerald), Bajista (rose) or Neutral (amber), with a confidence meter, justification, key factors, linked headlines, model and timestamp, an "En caché" badge and a **Reanalizar** button.
- **Gamification sidebar.** "Nivel de Inversionista" with progress to the next level, "Puntos de Análisis", and earned and locked badges. It updates after each fresh analysis.
- **Error UX.** Every API failure produces a Sonner toast with the backend's Spanish message, deduplicated per data source, plus an inline error state in the affected widget. Nothing is faked.
- **Real-time polling** every 60s (configurable), shared across components through SWR's cache.
- **Fail-fast configuration.** Zod validates the environment when `next dev` or `next build` starts.

## Scripts

| Command                           | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                     | Dev server with Turbopack and Fast Refresh on http://localhost:3000   |
| `npm run build`                   | Production build. Fails if `NEXT_PUBLIC_API_URL` is invalid.          |
| `npm start`                       | Serve the production build                                            |
| `npm run lint`                    | ESLint (Next core-web-vitals + TypeScript rules, Prettier-compatible) |
| `npm run format` / `format:check` | Prettier, including Tailwind class sorting                            |
| `npm run typecheck`               | `next typegen` (route types) + `tsc --noEmit`                         |
| `npm test` / `test:watch`         | Vitest + React Testing Library (jsdom)                                |

## Environment

| Variable                       | Required | Default | Notes                                                                                       |
| ------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | **yes**  | none    | Absolute http(s) URL of the API. The trailing slash is stripped. **Inlined at build time.** |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | no       | `60000` | Quote polling interval, ≥ 5000.                                                             |

Copy `.env.example` to `.env.local`. **Never** put secrets (such as `GEMINI_API_KEY`) in frontend env files, because every `NEXT_PUBLIC_*` value ships to the browser.

---

## Component library

### Dashboard components (`src/components/dashboard/`)

| Component                 | Props                                         | States                                                                                           | Data                                                                                             |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **`Dashboard`**           | none                                          | n/a                                                                                              | Owns `useWatchlist()` and the chart `range`. The single client island mounted by `app/page.tsx`. |
| **`TickerTape`**          | `symbols`, `selected`, `onSelect(symbol)`     | per item: price + change, `…` while loading, `sin datos` on error                                | `useQuote` per symbol                                                                            |
| **`SymbolSearch`**        | `watchlist`, `onAdd(symbol)`                  | idle / checking (spinner, disabled)                                                              | `mutate(keys.quote(s), api.quote(s))` to validate and prime the cache                            |
| **`PriceChart`**          | `symbol`, `range`, `onRangeChange(range)`     | chart / skeleton / inline error / "not enough data"                                              | `useQuote`, `useHistory(symbol, range)`                                                          |
| **`SentimentWidget`**     | `symbol`                                      | verdict / skeleton ("Analizando con Gemini…") / error with Reintentar / dimmed while reanalyzing | `useSentiment`                                                                                   |
| **`WatchlistGrid`**       | `symbols`, `selected`, `onSelect`, `onRemove` | n/a (removal is hidden when only one symbol is left)                                             | none                                                                                             |
| **`StockCard`**           | `symbol`, `selected`, `onSelect`, `onRemove?` | success / skeleton / inline error; selected ring                                                 | `useQuote`, `useHistory(symbol, "5d")`                                                           |
| **`Sparkline`**           | `history`                                     | n/a                                                                                              | none (pure Recharts line)                                                                        |
| **`PriceChange`**         | `percent`, `className?`                       | up / down / flat (`data-trend`)                                                                  | none                                                                                             |
| **`GamificationSidebar`** | none                                          | status / skeleton / error                                                                        | `useGamification`                                                                                |

Exported constants: `SENTIMENT_STYLES` (label, icon and color classes per sentiment) and `RANGE_LABELS`.

### shadcn/ui primitives (`src/components/ui/`)

Generated by the shadcn CLI (preset `base-nova`, built on **Base UI**) and owned by this repo:

| Primitive                                                 | Used by                            | Local changes                                                                                 |
| --------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `Card` (+ Header/Title/Description/Action/Content/Footer) | every widget                       | none                                                                                          |
| `Badge`                                                   | sentiment factors, "En caché"      | none                                                                                          |
| `Button`                                                  | search, ranges, Reanalizar, remove | none                                                                                          |
| `Input`                                                   | symbol search                      | none                                                                                          |
| `Skeleton`                                                | loading states                     | none                                                                                          |
| `Progress`                                                | confidence meter, level progress   | none (the indicator color is set by the parent via `[&_[data-slot=progress-indicator]]:bg-*`) |
| `Separator`                                               | sidebar sections                   | none                                                                                          |
| `Sonner` (`Toaster`)                                      | global toasts                      | `theme="dark"` fixed (no next-themes)                                                         |

Icons: **Lucide React**, imported per icon (`import { TrendingUp } from "lucide-react"`).

### Design tokens (`src/app/globals.css`)

The dark palette is defined on `.dark`. `<html>` always has the `dark` class.

| Token               | Utility                        | Meaning                                              |
| ------------------- | ------------------------------ | ---------------------------------------------------- |
| `--bull`            | `text-bull`, `bg-bull/10`      | price up · Alcista                                   |
| `--bear`            | `text-bear`, `bg-bear/10`      | price down · Bajista                                 |
| `--flat`            | `text-flat`, `bg-flat/10`      | unchanged · Neutral                                  |
| `--primary`         | `text-primary`, `ring-primary` | emerald brand accent                                 |
| `--animate-marquee` | `animate-marquee`              | ticker tape loop (duration via `--marquee-duration`) |

---

## Hooks reference (`src/hooks/`)

| Hook                                | Returns                                        | Behaviour                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useQuote(symbol \| null)`          | SWR response `<Quote, ApiError>`               | Polls every `NEXT_PUBLIC_POLL_INTERVAL_MS`, `keepPreviousData`. `null` disables it.                                                                                                                          |
| `useHistory(symbol \| null, range)` | SWR response `<PriceHistory, ApiError>`        | Intraday ranges poll at the quote cadence, longer ranges 5× slower.                                                                                                                                          |
| `useSentiment(symbol \| null)`      | SWR response + `reanalyze()` + `isReanalyzing` | **Not polled.** No focus or reconnect revalidation and no error retry. `reanalyze()` calls `?refresh=true`, writes the result into the cache, and toasts on failure. Fresh analyses revalidate gamification. |
| `useGamification()`                 | SWR response `<GamificationStatus, ApiError>`  | Polls every 60s.                                                                                                                                                                                             |
| `useWatchlist(initial?)`            | `{ symbols, selected, add, remove, select }`   | `useReducer` over the pure, immutable `watchlistReducer`.                                                                                                                                                    |

## Library modules (`src/lib/`)

| Module               | Purpose                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- |
| `env.ts` (in `src/`) | Zod-validated `env` object, imported by `next.config.ts`                               |
| `lib/api/client.ts`  | `apiGet(path, schema)` plus the typed `api.quote / history / sentiment / gamification` |
| `lib/api/schemas.ts` | Zod mirrors of the backend models, plus inferred TS types                              |
| `lib/api/errors.ts`  | `ApiError`, Spanish `FALLBACK_MESSAGES`, `errorMessage()`                              |
| `lib/api/keys.ts`    | SWR cache keys (single source of truth)                                                |
| `lib/notify.ts`      | `notifyError(error, id?, title?)`: deduplicated Sonner error toasts                    |
| `lib/format.ts`      | `es-ES` formatting for price, percent, change, volume and dates, plus trend helpers    |
| `lib/symbols.ts`     | default watchlist, symbol validation and normalization, display names                  |

## Tests

There are 66 tests in `src/__tests__/`. `fetch` is stubbed per test, so nothing hits the network.

| File                            | Covers                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.test.ts`                   | URL and poll-interval validation, defaults, coercion                                                                                                        |
| `api-client.test.ts`            | Success parsing, error envelope → `ApiError`, `Retry-After`, non-JSON errors, network errors, contract violations, URL encoding                             |
| `data-hooks.test.tsx`           | `useQuote` (success, 404 + toast, disabled), `useHistory`, `useSentiment` (points revalidation, cached, `reanalyze` success and failure), `useGamification` |
| `use-watchlist.test.ts`         | Immutable reducer semantics on frozen state, no-op identity, hook stability                                                                                 |
| `swr-config.test.ts`            | Retry policy: none on 4xx, exponential backoff, `Retry-After`, max retries                                                                                  |
| `ticker-tape.test.tsx`          | Live prices and trend, click → `onSelect`, a11y of the duplicated track, error placeholder                                                                  |
| `stock-card.test.tsx`           | Success, loading, error, select and remove, selected state                                                                                                  |
| `sentiment-widget.test.tsx`     | Color-coded verdicts per sentiment, details, cached badge, loading, error + toast (no fallback), Reanalizar                                                 |
| `gamification-sidebar.test.tsx` | Level, points and badges, max level, loading, error                                                                                                         |
| `symbol-search.test.tsx`        | Add after confirmation, 404 toast "Símbolo no encontrado", other failures, invalid format, existing symbol                                                  |
