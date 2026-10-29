import { render, renderHook, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { SWRConfig } from "swr";
import { vi } from "vitest";

import { swrConfig } from "@/components/providers";
import type {
  GamificationStatus,
  PriceHistory,
  Quote,
  Sentiment,
  SentimentAnalysis,
} from "@/lib/api/schemas";

export const API = "http://api.test";

/** Fresh SWR cache per test, the app's real onError (toasts), and no retry timers. */
function SWRTestProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        ...swrConfig,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}

export function renderWithSWR(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: SWRTestProvider, ...options });
}

export function renderHookWithSWR<T>(hook: () => T) {
  return renderHook(hook, { wrapper: SWRTestProvider });
}

// ---- fetch stubbing ---------------------------------------------------------------------

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

type Handler = (path: string) => Response | Promise<Response>;

/** Routes every `fetch` through `handler(pathWithQuery)` and returns the mock for assertions. */
export function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return handler(url.pathname + url.search);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function requestedPaths(fetchMock: ReturnType<typeof stubApi>): string[] {
  return fetchMock.mock.calls.map(([input]) => {
    const url = new URL(String(input));
    return url.pathname + url.search;
  });
}

export const never = () => new Promise<Response>(() => {});

// ---- fixtures ---------------------------------------------------------------------------

export function quoteFixture(symbol = "AAPL", overrides: Partial<Quote> = {}): Quote {
  return {
    symbol,
    price: 110,
    previous_close: 100,
    change: 10,
    change_percent: 10,
    volume: 1_234_567,
    currency: "USD",
    exchange: "NMS",
    as_of: "2026-10-28T15:00:00Z",
    ...overrides,
  };
}

export function historyFixture(symbol = "AAPL", closes = [100, 104, 108, 110]): PriceHistory {
  return {
    symbol,
    range: "5d",
    interval: "30m",
    points: closes.map((close, i) => ({ time: `2026-10-2${i}T15:00:00Z`, close })),
  };
}

export function sentimentFixture(
  sentiment: Sentiment = "bullish",
  overrides: Partial<SentimentAnalysis> = {},
): SentimentAnalysis {
  return {
    symbol: "AAPL",
    sentiment,
    confidence: 0.82,
    justification: "El precio sube con fuerza y los titulares son positivos.",
    key_factors: ["Tendencia alcista", "Resultados sólidos"],
    headlines: [
      {
        title: "Apple bate expectativas",
        publisher: "Reuters",
        url: "https://x.test/a",
        published_at: null,
      },
    ],
    model: "gemini-3-flash-preview",
    generated_at: "2026-10-28T15:00:00Z",
    cached: false,
    ...overrides,
  };
}

export function gamificationFixture(
  overrides: Partial<GamificationStatus> = {},
): GamificationStatus {
  return {
    points: 120,
    level: 2,
    level_name: "Analista",
    current_level_points: 50,
    next_level_points: 150,
    progress: 0.7,
    analyses_count: 9,
    badges: [
      {
        id: "first_analysis",
        name: "Primer análisis",
        description: "Tu primer análisis.",
        earned: true,
      },
      {
        id: "explorer",
        name: "Explorador de mercados",
        description: "Analiza 5 símbolos.",
        earned: false,
      },
    ],
    ...overrides,
  };
}
