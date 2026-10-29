// SWR cache keys. Centralized so hooks, mutations and tests agree on the exact shape.
import type { HistoryRange } from "@/lib/api/schemas";

export const keys = {
  quote: (symbol: string) => ["quote", symbol] as const,
  history: (symbol: string, range: HistoryRange) => ["history", symbol, range] as const,
  sentiment: (symbol: string) => ["sentiment", symbol] as const,
  gamification: () => ["gamification"] as const,
};
