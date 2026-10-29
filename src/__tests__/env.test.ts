import { describe, expect, it, vi } from "vitest";

import { env, parseEnv } from "@/env";

const BASE = { NEXT_PUBLIC_API_URL: "https://api.traderpulse.run.app" };

describe("parseEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    expect(parseEnv(BASE)).toEqual({
      NEXT_PUBLIC_API_URL: "https://api.traderpulse.run.app",
      NEXT_PUBLIC_POLL_INTERVAL_MS: 60_000,
    });
  });

  it("strips trailing slashes from the API URL", () => {
    expect(parseEnv({ NEXT_PUBLIC_API_URL: "http://localhost:8080/" }).NEXT_PUBLIC_API_URL).toBe(
      "http://localhost:8080",
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["relative", "/api"],
    ["non-http", "ftp://api.example.com"],
  ])("rejects a %s API URL", (_case, value) => {
    expect(() => parseEnv({ NEXT_PUBLIC_API_URL: value })).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("coerces the poll interval and treats an empty value as unset", () => {
    expect(
      parseEnv({ ...BASE, NEXT_PUBLIC_POLL_INTERVAL_MS: "15000" }).NEXT_PUBLIC_POLL_INTERVAL_MS,
    ).toBe(15_000);
    expect(
      parseEnv({ ...BASE, NEXT_PUBLIC_POLL_INTERVAL_MS: "" }).NEXT_PUBLIC_POLL_INTERVAL_MS,
    ).toBe(60_000);
  });

  it.each(["1000", "abc", "1.5"])("rejects poll interval %s", (value) => {
    expect(() => parseEnv({ ...BASE, NEXT_PUBLIC_POLL_INTERVAL_MS: value })).toThrow(
      /NEXT_PUBLIC_POLL_INTERVAL_MS/,
    );
  });

  it("parses process.env at import time", () => {
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://api.test");
  });

  it("falls back to the local API under a test runner instead of throwing", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.resetModules();

    const fresh = await import("@/env");

    expect(fresh.env.NEXT_PUBLIC_API_URL).toBe("http://localhost:8080");
  });
});
