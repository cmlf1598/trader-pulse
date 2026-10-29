"use client";

import { useCallback, useMemo, useReducer } from "react";

import { DEFAULT_WATCHLIST } from "@/lib/symbols";

export type WatchlistState = {
  readonly symbols: readonly string[];
  readonly selected: string;
};

export type WatchlistAction =
  | { readonly type: "add"; readonly symbol: string }
  | { readonly type: "remove"; readonly symbol: string }
  | { readonly type: "select"; readonly symbol: string };

/**
 * Pure, immutable reducer: every change returns a new object (and a new `symbols` array when
 * the list changes); no-ops return the same reference so React can skip re-renders.
 */
export function watchlistReducer(state: WatchlistState, action: WatchlistAction): WatchlistState {
  const { symbol } = action;
  const exists = state.symbols.includes(symbol);

  switch (action.type) {
    case "add":
      if (exists) return state.selected === symbol ? state : { ...state, selected: symbol };
      return { symbols: [...state.symbols, symbol], selected: symbol };

    case "remove": {
      // The dashboard always needs one selected symbol, so the last one can't be removed.
      if (!exists || state.symbols.length === 1) return state;
      const symbols = state.symbols.filter((s) => s !== symbol);
      const selected = state.selected === symbol ? symbols[0] : state.selected;
      return { symbols, selected };
    }

    case "select":
      if (!exists || state.selected === symbol) return state;
      return { ...state, selected: symbol };
  }
}

export function initialWatchlist(symbols: readonly string[] = DEFAULT_WATCHLIST): WatchlistState {
  return { symbols, selected: symbols[0] };
}

export function useWatchlist(initialSymbols?: readonly string[]) {
  const [state, dispatch] = useReducer(watchlistReducer, initialSymbols, initialWatchlist);

  const add = useCallback((symbol: string) => dispatch({ type: "add", symbol }), []);
  const remove = useCallback((symbol: string) => dispatch({ type: "remove", symbol }), []);
  const select = useCallback((symbol: string) => dispatch({ type: "select", symbol }), []);

  return useMemo(() => ({ ...state, add, remove, select }), [state, add, remove, select]);
}
