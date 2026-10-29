"use client";

import type { ReactNode } from "react";
import { SWRConfig, type SWRConfiguration } from "swr";

import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api/errors";
import { notifyError } from "@/lib/notify";

const MAX_RETRIES = 3;

export const swrConfig: SWRConfiguration = {
  // Every failed SWR request surfaces as a toast, deduplicated per cache key.
  onError: (error: unknown, key: string) => notifyError(error, key),
  onErrorRetry: (error: unknown, _key, _config, revalidate, { retryCount }) => {
    // 4xx (unknown symbol, bad input) will not fix itself: don't retry.
    if (error instanceof ApiError && error.isClientError) return;
    if (retryCount > MAX_RETRIES) return;
    const delay =
      error instanceof ApiError && error.retryAfterSeconds
        ? error.retryAfterSeconds * 1000
        : 2 ** retryCount * 2_000;
    setTimeout(() => void revalidate({ retryCount }), delay);
  },
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      {children}
      <Toaster position="top-right" richColors closeButton duration={6_000} />
    </SWRConfig>
  );
}
