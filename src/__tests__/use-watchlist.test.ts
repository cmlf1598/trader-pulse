import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { initialWatchlist, useWatchlist, watchlistReducer } from "@/hooks/use-watchlist";

function frozenState(symbols = ["AAPL", "MSFT", "NVDA"], selected = "AAPL") {
  return Object.freeze({ symbols: Object.freeze([...symbols]), selected });
}

describe("watchlistReducer (immutable)", () => {
  it("adds a new symbol as a new array and selects it", () => {
    const state = frozenState();

    const next = watchlistReducer(state, { type: "add", symbol: "TSLA" });

    expect(next).toEqual({ symbols: ["AAPL", "MSFT", "NVDA", "TSLA"], selected: "TSLA" });
    expect(next.symbols).not.toBe(state.symbols);
    expect(state.symbols).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("adding an existing symbol only selects it", () => {
    const state = frozenState();

    const next = watchlistReducer(state, { type: "add", symbol: "MSFT" });

    expect(next).toEqual({ symbols: state.symbols, selected: "MSFT" });
    expect(next.symbols).toBe(state.symbols);
  });

  it("removing the selected symbol selects the first remaining one", () => {
    const next = watchlistReducer(frozenState(undefined, "AAPL"), {
      type: "remove",
      symbol: "AAPL",
    });

    expect(next).toEqual({ symbols: ["MSFT", "NVDA"], selected: "MSFT" });
  });

  it("removing another symbol keeps the selection", () => {
    const next = watchlistReducer(frozenState(undefined, "NVDA"), {
      type: "remove",
      symbol: "MSFT",
    });

    expect(next).toEqual({ symbols: ["AAPL", "NVDA"], selected: "NVDA" });
  });

  it("returns the same reference for no-ops", () => {
    const state = frozenState();

    expect(watchlistReducer(state, { type: "select", symbol: "AAPL" })).toBe(state);
    expect(watchlistReducer(state, { type: "select", symbol: "UNKNOWN" })).toBe(state);
    expect(watchlistReducer(state, { type: "remove", symbol: "UNKNOWN" })).toBe(state);
  });

  it("never removes the last symbol", () => {
    const state = frozenState(["AAPL"]);

    expect(watchlistReducer(state, { type: "remove", symbol: "AAPL" })).toBe(state);
  });

  it("starts from the default watchlist", () => {
    const state = initialWatchlist();

    expect(state.symbols).toContain("BTC-USD");
    expect(state.selected).toBe(state.symbols[0]);
  });
});

describe("useWatchlist", () => {
  it("exposes stable actions and state", () => {
    const { result } = renderHook(() => useWatchlist(["AAPL", "MSFT"]));
    const { select } = result.current;

    act(() => result.current.select("MSFT"));

    expect(result.current.selected).toBe("MSFT");
    expect(result.current.select).toBe(select);
  });
});
