import type { z } from "zod";

import { env } from "@/env";
import { ApiError, fallbackMessage } from "@/lib/api/errors";
import {
  errorEnvelopeSchema,
  gamificationSchema,
  historySchema,
  quoteSchema,
  sentimentSchema,
  type HistoryRange,
} from "@/lib/api/schemas";

function parseRetryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get("Retry-After"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * GETs `path` from the backend and validates the body with `schema`.
 * Always resolves to typed data or rejects with an `ApiError`; never returns fallback data.
 */
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch (cause) {
    throw new ApiError(0, "network_error", fallbackMessage("network_error"), undefined, { cause });
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(body);
    const code = envelope.success ? envelope.data.error.code : `http_${response.status}`;
    const message = envelope.success ? envelope.data.error.message : fallbackMessage(code);
    throw new ApiError(response.status, code, message, parseRetryAfter(response));
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(response.status, "invalid_response", fallbackMessage("invalid_response"));
  }
  return parsed.data;
}

const symbolPath = (symbol: string) => encodeURIComponent(symbol);

export const api = {
  quote: (symbol: string) => apiGet(`/api/v1/stocks/${symbolPath(symbol)}`, quoteSchema),
  history: (symbol: string, range: HistoryRange) =>
    apiGet(`/api/v1/stocks/${symbolPath(symbol)}/history?range=${range}`, historySchema),
  sentiment: (symbol: string, { refresh = false }: { refresh?: boolean } = {}) =>
    apiGet(
      `/api/v1/sentiment/${symbolPath(symbol)}${refresh ? "?refresh=true" : ""}`,
      sentimentSchema,
    ),
  gamification: () => apiGet("/api/v1/gamification/status", gamificationSchema),
};
