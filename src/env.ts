import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .url({
      protocol: /^https?$/,
      error: "NEXT_PUBLIC_API_URL must be an absolute http(s) URL, e.g. http://localhost:8080",
    })
    .transform((url) => url.replace(/\/+$/, "")),
  NEXT_PUBLIC_POLL_INTERVAL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(5_000, "NEXT_PUBLIC_POLL_INTERVAL_MS must be at least 5000 ms")
      .default(60_000),
  ),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Each variable is referenced explicitly: Next.js only inlines `process.env.NEXT_PUBLIC_*`
// into the browser bundle when it sees the full member expression. This module is imported
// by next.config.ts, so `next dev` / `next build` fail fast on a bad value.
//
// Under a test runner (NODE_ENV=test), a missing API URL falls back to the local backend so
// external harnesses can import and render components; dev and builds still fail fast.
//
// Secrets such as GEMINI_API_KEY never belong here: everything in this file ships to the browser.
const TEST_API_URL = "http://localhost:8080";

export const env = parseEnv({
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "test" ? TEST_API_URL : undefined),
  NEXT_PUBLIC_POLL_INTERVAL_MS: process.env.NEXT_PUBLIC_POLL_INTERVAL_MS,
});
