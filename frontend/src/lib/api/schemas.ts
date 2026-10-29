// Runtime mirrors of the backend's Pydantic models (backend/app/schemas). If the API drifts,
// parsing fails with an `invalid_response` error instead of rendering garbage.
import { z } from "zod";

export const HISTORY_RANGES = ["1d", "5d", "1mo", "6mo", "1y"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

export const quoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  previous_close: z.number().nullable(),
  change: z.number().nullable(),
  change_percent: z.number().nullable(),
  volume: z.number().int().nullable(),
  currency: z.string().nullable(),
  exchange: z.string().nullable(),
  as_of: z.string(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const historySchema = z.object({
  symbol: z.string(),
  range: z.enum(HISTORY_RANGES),
  interval: z.string(),
  points: z.array(z.object({ time: z.string(), close: z.number() })),
});
export type PriceHistory = z.infer<typeof historySchema>;

export const headlineSchema = z.object({
  title: z.string(),
  publisher: z.string().nullable(),
  url: z.string().nullable(),
  published_at: z.string().nullable(),
});
export type Headline = z.infer<typeof headlineSchema>;

export const SENTIMENTS = ["bullish", "bearish", "neutral"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const sentimentSchema = z.object({
  symbol: z.string(),
  sentiment: z.enum(SENTIMENTS),
  confidence: z.number().min(0).max(1),
  justification: z.string(),
  key_factors: z.array(z.string()),
  headlines: z.array(headlineSchema),
  model: z.string(),
  generated_at: z.string(),
  cached: z.boolean(),
});
export type SentimentAnalysis = z.infer<typeof sentimentSchema>;

export const gamificationSchema = z.object({
  points: z.number().int(),
  level: z.number().int(),
  level_name: z.string(),
  current_level_points: z.number().int(),
  next_level_points: z.number().int().nullable(),
  progress: z.number().min(0).max(1),
  analyses_count: z.number().int(),
  points_per_analysis: z.number().int(),
  badges: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string(), earned: z.boolean() }),
  ),
});
export type GamificationStatus = z.infer<typeof gamificationSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
