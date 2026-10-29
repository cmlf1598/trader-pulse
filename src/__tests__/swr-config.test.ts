import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { swrConfig } from "@/components/providers";
import { ApiError } from "@/lib/api/errors";

type Retry = NonNullable<typeof swrConfig.onErrorRetry>;

function retry(error: unknown, retryCount: number) {
  const revalidate = vi.fn();
  (swrConfig.onErrorRetry as Retry)(error, "key", {} as Parameters<Retry>[2], revalidate, {
    retryCount,
    dedupe: true,
  });
  return revalidate;
}

describe("swrConfig.onErrorRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never retries client errors (e.g. unknown symbol)", () => {
    const revalidate = retry(new ApiError(404, "symbol_not_found", "x"), 1);

    vi.runAllTimers();

    expect(revalidate).not.toHaveBeenCalled();
  });

  it("retries server errors with exponential backoff", () => {
    const revalidate = retry(new ApiError(502, "market_unavailable", "x"), 2);

    vi.advanceTimersByTime(7_999);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 2 });
  });

  it("honours Retry-After", () => {
    const revalidate = retry(new ApiError(503, "rate_limited", "x", 30), 1);

    vi.advanceTimersByTime(29_999);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalled();
  });

  it("gives up after the maximum number of retries", () => {
    const revalidate = retry(new ApiError(502, "market_unavailable", "x"), 4);

    vi.runAllTimers();

    expect(revalidate).not.toHaveBeenCalled();
  });
});
