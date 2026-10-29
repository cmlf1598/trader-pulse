import { describe, expect, it } from "vitest";

import { newlyEarnedBadges, withPendingAnalysis } from "@/lib/gamification";

import { gamificationFixture } from "./test-utils";

describe("withPendingAnalysis", () => {
  it("credits one analysis and recomputes progress", () => {
    const next = withPendingAnalysis(gamificationFixture());

    expect(next.points).toBe(130);
    expect(next.analyses_count).toBe(10);
    expect(next.progress).toBeCloseTo(0.8);
    expect(next.level).toBe(2);
  });

  it("caps progress at 100% until the server confirms the level-up", () => {
    const next = withPendingAnalysis(gamificationFixture({ points: 145 }));

    expect(next.progress).toBe(1);
  });

  it("keeps full progress at the maximum level", () => {
    const next = withPendingAnalysis(
      gamificationFixture({ points: 700, current_level_points: 600, next_level_points: null }),
    );

    expect(next.points).toBe(710);
    expect(next.progress).toBe(1);
  });
});

describe("newlyEarnedBadges", () => {
  it("returns only badges that flipped to earned", () => {
    const before = gamificationFixture();
    const after = gamificationFixture({
      badges: before.badges.map((badge) => ({ ...badge, earned: true })),
    });

    expect(newlyEarnedBadges(before, after).map((b) => b.id)).toEqual(["explorer"]);
  });
});
