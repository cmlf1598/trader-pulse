# Frontend Onboarding: TraderPulse Dashboard

Everything you need to work on the Next.js app: running it, what lives where, step-by-step recipes for common changes, testing, debugging and deployment.

← [Hub](../ONBOARDING.md) · [Frontend README (components & hooks)](README.md) · [Frontend architecture](ARCHITECTURE.md)

---

## 1. Quick start

```bash
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev                     # http://localhost:3000
```

The dashboard needs the backend running (see [backend quick start](../backend/ONBOARDING.md#1-quick-start)). Without it you'll see "sin datos" placeholders and a toast saying _"No se pudo conectar con el servidor de TraderPulse."_, which is the intended behaviour.

Before committing, run the quality gate:

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

> **Read `AGENTS.md`.** Next.js 16 changed several APIs. The exact docs for the installed version are in `node_modules/next/dist/docs/`, so use those rather than older blog posts.

---

## 2. Project structure deep dive

```
frontend/
├── src/
│   ├── env.ts                      # Zod env schema → typed `env` (also imported by next.config.ts)
│   ├── app/                        # App Router
│   │   ├── layout.tsx              # <html lang="es" class="dark">, fonts, metadata, <Providers>
│   │   ├── page.tsx                # Server Component: static shell (header/footer) + <Dashboard/>
│   │   └── globals.css             # Tailwind v4, shadcn tokens, TraderPulse palette, marquee keyframes
│   ├── components/
│   │   ├── providers.tsx           # "use client": SWRConfig (onError → toast, retry policy) + Toaster
│   │   ├── dashboard/              # feature components (all client components)
│   │   │   ├── dashboard.tsx       # the client island: watchlist + range state, layout grid
│   │   │   ├── ticker-tape.tsx     # marquee of TickerItems (useQuote each)
│   │   │   ├── symbol-search.tsx   # validate → confirm with API → add
│   │   │   ├── price-chart.tsx     # Recharts AreaChart + range toggles
│   │   │   ├── sentiment-widget.tsx# Gemini verdict, Reanalizar
│   │   │   ├── watchlist-grid.tsx  # grid of StockCard
│   │   │   ├── stock-card.tsx      # quote + sparkline + states
│   │   │   ├── sparkline.tsx       # tiny Recharts line
│   │   │   ├── price-change.tsx    # ▲/▼ percent with trend color
│   │   │   └── gamification-sidebar.tsx
│   │   └── ui/                     # shadcn/ui primitives (generated; edit sparingly)
│   ├── hooks/                      # data + state hooks (SWR, reducer)
│   ├── lib/
│   │   ├── api/{client,schemas,errors,keys}.ts   # the only code that knows HTTP
│   │   ├── notify.ts               # toast helper
│   │   ├── format.ts               # es-ES formatting, trend helpers
│   │   ├── symbols.ts              # default watchlist, validation, display names
│   │   └── utils.ts                # `cn()` (shadcn class merging)
│   └── __tests__/                  # Vitest suites + test-utils.tsx (SWR wrapper, fetch stubs, fixtures)
├── next.config.ts                  # imports ./src/env (build-time validation); cacheComponents on
├── vitest.config.mts · vitest.setup.ts   # jsdom, env, ResizeObserver stub, global sonner mock
├── eslint.config.mjs · .prettierrc       # lint + format (Prettier owns formatting)
├── components.json                 # shadcn CLI config (preset base-nova, aliases)
├── Dockerfile                      # DEV ONLY (docker-compose); Vercel builds production
└── .env.example
```

### Rules of thumb

| Concern                                     | Where it belongs                                                      |
| ------------------------------------------- | --------------------------------------------------------------------- |
| HTTP calls, URLs, response parsing          | `lib/api/` only. Components never call `fetch`.                       |
| Server data in components                   | A hook in `hooks/` (SWR), keyed by `lib/api/keys.ts`                  |
| UI-only state (watchlist, selection, range) | `useReducer` or `useState` in `Dashboard`, passed down as props       |
| User-facing copy                            | Spanish, inline in components. API error copy comes from the backend. |
| Formatting numbers and dates                | `lib/format.ts` (`es-ES`). Never `toFixed` in JSX.                    |
| Colors                                      | Tokens (`text-bull`, `bg-bear/10`, `text-primary`), not raw hex       |

---

## 3. Common workflows

### 3.1 Add a dashboard widget

Example: a "Top movers" card.

1. Create `src/components/dashboard/top-movers.tsx` with `"use client"` and compose shadcn primitives (`Card`, `Badge`…).
2. Read data **only** through hooks, e.g. `useQuote(symbol)` for each watchlist symbol. Requests are deduplicated with the ticker and cards for free.
3. Handle all three states explicitly: data, loading (`Skeleton` with `role="status"` and an `aria-label` in Spanish), and error (`role="alert"` with `error.message`). The global toast already fires, so the inline state is for context.
4. Mount it in `dashboard.tsx` and pass props down. Don't read the watchlist from a global.
5. Add `src/__tests__/top-movers.test.tsx` using `renderWithSWR` and `stubApi` from `test-utils.tsx`.
6. Document it in the [component library table](README.md#component-library).

### 3.2 Consume a new endpoint

Example: the backend adds `GET /api/v1/stocks/{symbol}/profile`.

1. **Schema.** Add it to `lib/api/schemas.ts`, mirroring the Pydantic model exactly:
   ```ts
   export const profileSchema = z.object({
     symbol: z.string(),
     sector: z.string().nullable(),
     industry: z.string().nullable(),
   });
   export type Profile = z.infer<typeof profileSchema>;
   ```
2. **Client.** Add to `api` in `lib/api/client.ts`:
   ```ts
   profile: (symbol: string) =>
     apiGet(`/api/v1/stocks/${encodeURIComponent(symbol)}/profile`, profileSchema),
   ```
3. **Key.** Add `profile: (symbol: string) => ["profile", symbol] as const` to `lib/api/keys.ts`.
4. **Hook.** Create `hooks/use-profile.ts`:
   ```ts
   export function useProfile(symbol: string | null) {
     return useSWR<Profile, ApiError>(
       symbol ? keys.profile(symbol) : null,
       () => api.profile(symbol!),
       {
         revalidateOnFocus: false, // profiles rarely change
       },
     );
   }
   ```
5. **Test.** Add the hook to `data-hooks.test.tsx` (success plus one error case).

Errors need no extra work: they arrive as `ApiError`, and `SWRConfig.onError` toasts them.

### 3.3 Add a shadcn/ui component

```bash
npx shadcn@latest add dialog      # writes src/components/ui/dialog.tsx
```

The project uses the **base-nova** preset (Base UI primitives), so the API differs slightly from Radix-based examples. For instance, `Button` accepts a `render` prop instead of `asChild`. Generated files are excluded from Prettier (`.prettierignore`) so that re-adding a component produces clean diffs.

### 3.4 Change the polling interval

Set `NEXT_PUBLIC_POLL_INTERVAL_MS` (≥ 5000) in `.env.local`, or in the Vercel project settings, then rebuild. The value is inlined at build time. Long-range history polls 5× slower, and sentiment never polls.

### 3.5 Add or change a toast

- **Data errors** go through `notifyError(error, id, title?)` in `lib/notify.ts`. Pass a stable `id` so repeated failures update one toast instead of stacking.
- **Success or info:** call `toast.success("…", { id })` from `sonner` directly. Keep the copy in Spanish.
- To change copy for a backend error, edit the `message` in `backend/app/core/errors.py`. The frontend displays it verbatim. `FALLBACK_MESSAGES` is only for non-envelope failures.

### 3.6 Add a symbol to the default watchlist

Edit `DEFAULT_WATCHLIST` (and optionally `SYMBOL_NAMES`) in `lib/symbols.ts`.

---

## 4. Testing

```bash
npm test                                   # all suites (~4 s)
npm run test:watch                         # watch mode
npx vitest run src/__tests__/sentiment-widget.test.tsx -t "Reanalizar"
```

**Toolkit (`src/__tests__/test-utils.tsx`):**

| Helper                                                                        | Use                                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `renderWithSWR(ui)` / `renderHookWithSWR(hook)`                               | Renders inside an isolated SWR cache (`provider: () => new Map()`) with the app's real `onError`. Retries are disabled. |
| `stubApi((path) => Response)`                                                 | Replaces `fetch`. The handler receives `pathname + search`, e.g. `/api/v1/sentiment/AAPL?refresh=true`.                 |
| `json(body, status?, headers?)` / `apiError(status, code, message)` / `never` | Response builders. `never` keeps a request pending, for loading states.                                                 |
| `requestedPaths(fetchMock)`                                                   | Asserts which endpoints were called.                                                                                    |
| `quoteFixture`, `historyFixture`, `sentimentFixture`, `gamificationFixture`   | Valid payloads with overrides.                                                                                          |

**Conventions:**

- `sonner` is mocked globally in `vitest.setup.ts`. Assert with `expect(toast.error).toHaveBeenCalledWith(...)`.
- Query by role and accessible name (`getByRole("button", { name: "Reanalizar" })`), not CSS classes. Color assertions use `toHaveClass("text-bull")` on purpose.
- SWR's `mutate(key)` only revalidates **mounted** hooks. When a test depends on cross-hook revalidation, mount both hooks (see `useSentimentWithPoints` in `data-hooks.test.tsx`).
- Async Server Components can't be rendered by RTL. `page.tsx` is intentionally a thin synchronous shell, and all logic lives in testable client components and hooks.

---

## 5. Debugging

### VS Code (`.vscode/launch.json` at the repo root)

| Config                                             | Use it for                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend: Next.js (server-side)**                | Runs `npm run dev` under the Node debugger, for breakpoints in `page.tsx`, `layout.tsx` and `next.config.ts`.                    |
| **Frontend: Next.js (client-side, Edge / Chrome)** | Launches a browser attached to VS Code, for breakpoints in components, hooks and `lib/api/client.ts`. Start `npm run dev` first. |
| **Frontend: Vitest (current file)**                | Debug the open test file.                                                                                                        |
| **Full stack: Backend + Frontend**                 | Starts the FastAPI debugger and the Next.js dev server together.                                                                 |

### Browser techniques

- **Network tab:** filter by `api/v1` to see each poll. A 60s cadence and deduplication are expected, so 8 cards plus the ticker plus the chart make about 10 quote requests, not 20.
- **SWR cache:** in a client component, temporarily `const { cache } = useSWRConfig(); console.log([...cache.keys()])`.
- **CORS errors** in the console mean the page origin isn't in the backend's allow-list. Check `FRONTEND_URL` in `backend/.env`.
- **Hydration warnings:** prices and dates come from client-side fetches, so they shouldn't occur. If you add server-rendered times, format them on the client.
- The Next.js dev overlay (the "N" button) shows build and runtime errors, including Zod env failures.

---

## 6. Styling guide

- Tailwind v4 with CSS-first configuration in `globals.css`. There is no `tailwind.config.js`.
- Dark only: `<html class="dark">` is fixed. Tokens live under `.dark { … }`.
- Use semantic tokens: `bg-card`, `text-muted-foreground`, `text-bull` / `text-bear` / `text-flat`, `ring-primary`.
- Use `tabular-nums` for any changing number, so the layout doesn't jitter.
- Respect motion preferences with `motion-reduce:` variants, as the marquee and ping dot do.
- Prettier sorts Tailwind classes automatically (`prettier-plugin-tailwindcss`).

---

## 7. Troubleshooting

| Symptom                                                                   | Fix                                                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment variables … NEXT_PUBLIC_API_URL` on `dev` or `build` | Create `.env.local` from `.env.example`, or set the variable in Vercel.                                                                                         |
| Changed `NEXT_PUBLIC_API_URL` on Vercel but nothing changed               | Values are inlined at build time, so **redeploy**.                                                                                                              |
| `npm install` ERESOLVE mentioning `@babel/core`                           | Don't add `@vitejs/plugin-react`. Vitest 5 and Vite 8 handle JSX natively (see [ARCHITECTURE → ADR-F8](ARCHITECTURE.md#adr-f8-no-vitejsplugin-react-in-tests)). |
| Recharts warns `width(0) and height(0)` in tests                          | Harmless in jsdom. `ResizeObserver` is stubbed and tests assert states, not SVG geometry.                                                                       |
| Toast spam while the backend is down                                      | Toasts are deduplicated per SWR key. If you see stacking, check that the code calling `notifyError` passes an `id`.                                             |

---

## 8. Deploying to Vercel

1. Import the repository in Vercel and set **Root Directory** to `frontend`. The framework (Next.js) is detected automatically.
2. Under **Environment Variables**, set `NEXT_PUBLIC_API_URL=https://<your-cloud-run-url>` (and optionally `NEXT_PUBLIC_POLL_INTERVAL_MS`) for Production, and for Preview if you have a staging API.
3. Deploy. The build fails if the env is invalid, so a broken config never goes live.
4. Set the backend's `FRONTEND_URL` to the production domain (e.g. `https://traderpulse.vercel.app`) and redeploy Cloud Run. Otherwise the browser's calls are blocked by CORS.
5. **Preview deployments** get unique URLs that are _not_ in the backend allow-list. Either point Preview at a development backend whose `FRONTEND_URL` matches your preview domain, or test previews against a local API.

Nothing about the production build depends on `Dockerfile`, which is only for `docker compose`.
