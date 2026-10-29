"use client";

import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { api } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import type { SentimentAnalysis } from "@/lib/api/schemas";
import { notifyError } from "@/lib/notify";

/**
 * Gemini sentiment for `symbol`. Deliberately NOT polled: every fresh analysis is a paid model
 * call. It loads when the symbol changes and re-runs only through `reanalyze()`, which bypasses
 * the backend's short-lived cache (`?refresh=true`).
 */
export function useSentiment(symbol: string | null) {
  const { mutate } = useSWRConfig();
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const refreshPoints = useCallback(
    (analysis: SentimentAnalysis) => {
      // A fresh (non-cached) analysis awards points on the backend.
      if (!analysis.cached) void mutate(keys.gamification());
    },
    [mutate],
  );

  const query = useSWR<SentimentAnalysis, ApiError>(
    symbol ? keys.sentiment(symbol) : null,
    () => api.sentiment(symbol!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      onSuccess: refreshPoints,
    },
  );

  const reanalyze = useCallback(async () => {
    if (!symbol) return;
    setIsReanalyzing(true);
    try {
      const analysis = await api.sentiment(symbol, { refresh: true });
      await mutate(keys.sentiment(symbol), analysis, { revalidate: false });
      refreshPoints(analysis);
    } catch (error) {
      // Not routed through SWR's global onError (this is a manual fetch), so toast here.
      notifyError(error, `sentiment:${symbol}`, "No se pudo reanalizar");
    } finally {
      setIsReanalyzing(false);
    }
  }, [mutate, refreshPoints, symbol]);

  return { ...query, isReanalyzing, reanalyze };
}
