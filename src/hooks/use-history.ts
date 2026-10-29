"use client";

import useSWR from "swr";

import { env } from "@/env";
import { api } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import type { HistoryRange, PriceHistory } from "@/lib/api/schemas";

const INTRADAY: ReadonlySet<HistoryRange> = new Set(["1d", "5d"]);

/**
 * Historical closes for charts. Intraday ranges refresh at the quote cadence; longer ranges
 * change at most once a day, so they refresh 5x less often.
 */
export function useHistory(symbol: string | null, range: HistoryRange) {
  const interval = INTRADAY.has(range)
    ? env.NEXT_PUBLIC_POLL_INTERVAL_MS
    : env.NEXT_PUBLIC_POLL_INTERVAL_MS * 5;

  return useSWR<PriceHistory, ApiError>(
    symbol ? keys.history(symbol, range) : null,
    () => api.history(symbol!, range),
    { refreshInterval: interval, keepPreviousData: true },
  );
}

export function isIntraday(range: HistoryRange): boolean {
  return INTRADAY.has(range);
}
