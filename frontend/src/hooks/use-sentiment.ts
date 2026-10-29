"use client";

import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { api } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import type { GamificationStatus, SentimentAnalysis } from "@/lib/api/schemas";
import { withPendingAnalysis } from "@/lib/gamification";
import { notifyError, notifyProgress, notifyXpGained } from "@/lib/notify";

/**
 * Gemini sentiment for `symbol`. Deliberately NOT polled: every fresh analysis is a paid model
 * call. It loads when the symbol changes and re-runs only through `reanalyze()`, which bypasses
 * the backend's short-lived cache (`?refresh=true`).
 *
 * Points are optimistic: the sidebar is credited as soon as a request starts, then reconciled
 * with the server, which awards points only for fresh (non-cached) analyses.
 */
export function useSentiment(symbol: string | null) {
  const { mutate } = useSWRConfig();
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const analyze = useCallback(
    async (target: string, refresh = false): Promise<SentimentAnalysis> => {
      let before: GamificationStatus | undefined;
      await mutate<GamificationStatus>(
        keys.gamification(),
        (current) => {
          before = current;
          return current && withPendingAnalysis(current);
        },
        { revalidate: false },
      );

      let analysis: SentimentAnalysis;
      try {
        analysis = await api.sentiment(target, { refresh });
      } catch (error) {
        void mutate(keys.gamification());
        throw error;
      }

      // Server truth: confirms a fresh award, or rolls back the optimistic one for a cached result.
      void mutate<GamificationStatus>(keys.gamification()).then((after) => {
        if (analysis.cached) return;
        notifyXpGained(target, (after ?? before)?.points_per_analysis);
        if (before && after) notifyProgress(before, after);
      });
      return analysis;
    },
    [mutate],
  );

  const query = useSWR<SentimentAnalysis, ApiError>(
    symbol ? keys.sentiment(symbol) : null,
    () => analyze(symbol!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
    },
  );

  const reanalyze = useCallback(async () => {
    if (!symbol) return;
    setIsReanalyzing(true);
    try {
      const analysis = await analyze(symbol, true);
      await mutate(keys.sentiment(symbol), analysis, { revalidate: false });
    } catch (error) {
      // Not routed through SWR's global onError (this is a manual fetch), so toast here.
      notifyError(error, `sentiment:${symbol}`, "No se pudo reanalizar");
    } finally {
      setIsReanalyzing(false);
    }
  }, [analyze, mutate, symbol]);

  return { ...query, isReanalyzing, reanalyze };
}
