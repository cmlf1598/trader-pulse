"use client";

import { useState } from "react";

import { useWatchlist } from "@/hooks/use-watchlist";
import type { HistoryRange } from "@/lib/api/schemas";

import { GamificationSidebar } from "./gamification-sidebar";
import { PriceChart } from "./price-chart";
import { SentimentWidget } from "./sentiment-widget";
import { SymbolSearch } from "./symbol-search";
import { TickerTape } from "./ticker-tape";
import { WatchlistGrid } from "./watchlist-grid";

/** Client island that owns the interactive state: watchlist, selected symbol and chart range. */
export function Dashboard() {
  const watchlist = useWatchlist();
  const [range, setRange] = useState<HistoryRange>("1mo");

  return (
    <>
      <TickerTape
        symbols={watchlist.symbols}
        selected={watchlist.selected}
        onSelect={watchlist.select}
      />

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <SymbolSearch watchlist={watchlist.symbols} onAdd={watchlist.add} />

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PriceChart symbol={watchlist.selected} range={range} onRangeChange={setRange} />
            <SentimentWidget symbol={watchlist.selected} />
          </div>

          <section aria-labelledby="watchlist-heading" className="space-y-3">
            <h2 id="watchlist-heading" className="text-sm font-medium text-muted-foreground">
              Tu lista de seguimiento
            </h2>
            <WatchlistGrid
              symbols={watchlist.symbols}
              selected={watchlist.selected}
              onSelect={watchlist.select}
              onRemove={watchlist.remove}
            />
          </section>
        </div>

        <aside aria-label="Gamificación" className="lg:sticky lg:top-6 lg:self-start">
          <GamificationSidebar />
        </aside>
      </div>
    </>
  );
}
