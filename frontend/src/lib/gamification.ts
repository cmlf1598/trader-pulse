import type { GamificationStatus } from "@/lib/api/schemas";

/**
 * Optimistic copy of `status` with one more analysis credited. Level and badges are left to the
 * server: the next revalidation replaces this snapshot with the authoritative one.
 */
export function withPendingAnalysis(status: GamificationStatus): GamificationStatus {
  const points = status.points + status.points_per_analysis;
  const span =
    status.next_level_points === null
      ? null
      : status.next_level_points - status.current_level_points;
  return {
    ...status,
    points,
    analyses_count: status.analyses_count + 1,
    progress: span === null ? 1 : Math.min(1, (points - status.current_level_points) / span),
  };
}

/** Badges earned in `after` that were not earned in `before`. */
export function newlyEarnedBadges(
  before: GamificationStatus,
  after: GamificationStatus,
): GamificationStatus["badges"] {
  const earnedBefore = new Set(before.badges.filter((b) => b.earned).map((b) => b.id));
  return after.badges.filter((b) => b.earned && !earnedBefore.has(b.id));
}
