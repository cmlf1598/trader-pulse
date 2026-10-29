"use client";

import useSWR from "swr";

import { env } from "@/env";
import { api } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import type { Quote } from "@/lib/api/schemas";

/** Real-time quote, polled every `NEXT_PUBLIC_POLL_INTERVAL_MS` (60s by default). */
export function useQuote(symbol: string | null) {
  return useSWR<Quote, ApiError>(symbol ? keys.quote(symbol) : null, () => api.quote(symbol!), {
    refreshInterval: env.NEXT_PUBLIC_POLL_INTERVAL_MS,
    keepPreviousData: true,
  });
}
