import { act, waitFor } from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useGamification } from "@/hooks/use-gamification";
import { useHistory } from "@/hooks/use-history";
import { useQuote } from "@/hooks/use-quote";
import { useSentiment } from "@/hooks/use-sentiment";
import { ApiError } from "@/lib/api/errors";

import {
  apiError,
  gamificationFixture,
  historyFixture,
  json,
  quoteFixture,
  renderHookWithSWR,
  requestedPaths,
  sentimentFixture,
  stubApi,
} from "./test-utils";

describe("useQuote", () => {
  it("loads a quote", async () => {
    stubApi(() => json(quoteFixture("MSFT")));

    const { result } = renderHookWithSWR(() => useQuote("MSFT"));

    await waitFor(() => expect(result.current.data?.symbol).toBe("MSFT"));
    expect(result.current.error).toBeUndefined();
  });

  it("exposes ApiError and raises a deduplicated toast on 404", async () => {
    stubApi(() => apiError(404, "symbol_not_found", "No se encontró el símbolo «ZZZZ»."));

    const { result } = renderHookWithSWR(() => useQuote("ZZZZ"));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(result.current.error?.code).toBe("symbol_not_found");
    expect(toast.error).toHaveBeenCalledWith(
      "No se encontró el símbolo «ZZZZ».",
      expect.objectContaining({ id: expect.any(String) }),
    );
  });

  it("does not fetch without a symbol", () => {
    const fetchMock = stubApi(() => json({}));

    renderHookWithSWR(() => useQuote(null));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useHistory", () => {
  it("requests the given range", async () => {
    const fetchMock = stubApi(() => json(historyFixture()));

    const { result } = renderHookWithSWR(() => useHistory("AAPL", "5d"));

    await waitFor(() => expect(result.current.data?.points).toHaveLength(4));
    expect(requestedPaths(fetchMock)).toEqual(["/api/v1/stocks/AAPL/history?range=5d"]);
  });
});

describe("useSentiment", () => {
  // The sidebar's useGamification is always mounted in the app; mount it here too, because
  // SWR's mutate(key) revalidates only hooks currently subscribed to that key.
  function useSentimentWithPoints(symbol: string) {
    useGamification();
    return useSentiment(symbol);
  }
  const gamificationCalls = (fetchMock: ReturnType<typeof stubApi>) =>
    requestedPaths(fetchMock).filter((p) => p.startsWith("/api/v1/gamification")).length;

  // Points load first, then the symbol is selected, like a click in the running dashboard.
  function renderSelection() {
    let select: (symbol: string) => void = () => {};
    const view = renderHookWithSWR(() => {
      const [symbol, setSymbol] = useState<string | null>(null);
      select = setSymbol;
      return { points: useGamification(), sentiment: useSentiment(symbol) };
    });
    return { ...view, select: (symbol: string) => act(() => select(symbol)) };
  }
  const xpToasts = () =>
    vi.mocked(toast.success).mock.calls.filter(([title]) => title === "¡XP ganada!");

  it("loads the analysis, confirms points with the server and toasts XP", async () => {
    const fetchMock = stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationFixture())
        : json(sentimentFixture()),
    );

    const { result } = renderHookWithSWR(() => useSentimentWithPoints("AAPL"));

    await waitFor(() => expect(result.current.data?.sentiment).toBe("bullish"));
    await waitFor(() => expect(gamificationCalls(fetchMock)).toBe(2));
    expect(toast.success).toHaveBeenCalledWith("¡XP ganada!", {
      description: "+10 Puntos de Análisis por analizar AAPL.",
    });
  });

  it("credits points optimistically while the analysis is in flight", async () => {
    let finish: (response: Response) => void = () => {};
    stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationFixture())
        : new Promise<Response>((resolve) => (finish = resolve)),
    );
    const { result, select } = renderSelection();
    await waitFor(() => expect(result.current.points.data?.points).toBe(120));

    await select("AAPL");

    await waitFor(() => expect(result.current.points.data?.points).toBe(130));
    expect(result.current.points.data?.analyses_count).toBe(10);
    expect(result.current.points.data?.progress).toBeCloseTo(0.8);
    await act(async () => finish(json(sentimentFixture())));
    await waitFor(() => expect(result.current.sentiment.data?.sentiment).toBe("bullish"));
  });

  it("rolls the optimistic points back for a cached analysis, without an XP toast", async () => {
    const fetchMock = stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationFixture())
        : json(sentimentFixture("neutral", { cached: true })),
    );
    const { result, select } = renderSelection();
    await waitFor(() => expect(result.current.points.data?.points).toBe(120));

    await select("AAPL");

    await waitFor(() => expect(result.current.sentiment.data?.cached).toBe(true));
    await waitFor(() => expect(gamificationCalls(fetchMock)).toBe(2));
    await waitFor(() => expect(result.current.points.data?.points).toBe(120));
    expect(xpToasts()).toHaveLength(0);
  });

  it("rolls the optimistic points back when the analysis fails", async () => {
    const fetchMock = stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationFixture())
        : apiError(502, "ai_unavailable", "El análisis de IA no está disponible en este momento."),
    );
    const { result, select } = renderSelection();
    await waitFor(() => expect(result.current.points.data?.points).toBe(120));

    await select("AAPL");

    await waitFor(() => expect(result.current.sentiment.error).toBeInstanceOf(ApiError));
    await waitFor(() => expect(gamificationCalls(fetchMock)).toBe(2));
    expect(result.current.points.data?.points).toBe(120);
    expect(xpToasts()).toHaveLength(0);
  });

  it("announces level-ups and newly earned badges", async () => {
    const before = gamificationFixture({ points: 40, level: 1, level_name: "Novato" });
    const after = gamificationFixture({
      points: 50,
      level: 2,
      level_name: "Analista",
      badges: [
        ...before.badges,
        {
          id: "bull_market_expert",
          name: "Experto en Mercado Alcista",
          description: "Completa 5 análisis de sentimiento.",
          earned: true,
        },
      ],
    });
    let gamificationResponses = 0;
    stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationResponses++ === 0 ? before : after)
        : json(sentimentFixture()),
    );
    const { result, select } = renderSelection();
    await waitFor(() => expect(result.current.points.data?.points).toBe(40));

    await select("AAPL");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Insignia desbloqueada: Experto en Mercado Alcista",
        { description: "Completa 5 análisis de sentimiento." },
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("¡Subiste de nivel!", {
      description: "Ahora eres Analista (nivel 2).",
    });
  });

  it("reanalyze() bypasses the cache and replaces the data", async () => {
    const fetchMock = stubApi((path) => {
      if (path.startsWith("/api/v1/gamification")) return json(gamificationFixture());
      return path.endsWith("refresh=true")
        ? json(sentimentFixture("bearish"))
        : json(sentimentFixture("bullish", { cached: true }));
    });
    const { result } = renderHookWithSWR(() => useSentiment("AAPL"));
    await waitFor(() => expect(result.current.data?.sentiment).toBe("bullish"));

    await act(() => result.current.reanalyze());

    expect(result.current.data?.sentiment).toBe("bearish");
    expect(result.current.isReanalyzing).toBe(false);
    expect(requestedPaths(fetchMock)).toContain("/api/v1/sentiment/AAPL?refresh=true");
  });

  it("reanalyze() failures keep the previous result and toast", async () => {
    stubApi((path) =>
      path.endsWith("refresh=true")
        ? apiError(502, "ai_unavailable", "El análisis de IA no está disponible en este momento.")
        : json(sentimentFixture("bullish", { cached: true })),
    );
    const { result } = renderHookWithSWR(() => useSentiment("AAPL"));
    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(() => result.current.reanalyze());

    expect(result.current.data?.sentiment).toBe("bullish");
    expect(toast.error).toHaveBeenCalledWith("No se pudo reanalizar", {
      id: "sentiment:AAPL",
      description: "El análisis de IA no está disponible en este momento.",
    });
  });
});

describe("useGamification", () => {
  it("loads the status", async () => {
    stubApi(() => json(gamificationFixture()));

    const { result } = renderHookWithSWR(() => useGamification());

    await waitFor(() => expect(result.current.data?.level_name).toBe("Analista"));
  });
});
