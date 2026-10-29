"use client";

import useSWR from "swr";

import { env } from "@/env";
import { api } from "@/lib/api/client";
import type { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import type { GamificationStatus } from "@/lib/api/schemas";

/** Demo user points/level/badges. Also revalidated by `useSentiment` after each new analysis. */
export function useGamification() {
  return useSWR<GamificationStatus, ApiError>(keys.gamification(), () => api.gamification(), {
    refreshInterval: env.NEXT_PUBLIC_POLL_INTERVAL_MS,
  });
}
