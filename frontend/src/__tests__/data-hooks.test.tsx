import { act, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it } from "vitest";

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

  it("loads the analysis and refreshes points after a fresh one", async () => {
    const fetchMock = stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationFixture())
        : json(sentimentFixture()),
    );

    const { result } = renderHookWithSWR(() => useSentimentWithPoints("AAPL"));

    await waitFor(() => expect(result.current.data?.sentiment).toBe("bullish"));
    await waitFor(() => expect(gamificationCalls(fetchMock)).toBe(2));
  });

  it("does not refresh points for a cached analysis", async () => {
    const fetchMock = stubApi((path) =>
      path.startsWith("/api/v1/gamification")
        ? json(gamificationFixture())
        : json(sentimentFixture("neutral", { cached: true })),
    );

    const { result } = renderHookWithSWR(() => useSentimentWithPoints("AAPL"));

    await waitFor(() => expect(result.current.data?.cached).toBe(true));
    await waitFor(() => expect(gamificationCalls(fetchMock)).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gamificationCalls(fetchMock)).toBe(1);
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
