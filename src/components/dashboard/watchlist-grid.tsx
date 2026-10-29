"use client";

import { StockCard } from "./stock-card";

type WatchlistGridProps = {
  symbols: readonly string[];
  selected: string;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
};

export function WatchlistGrid({ symbols, selected, onSelect, onRemove }: WatchlistGridProps) {
  const removable = symbols.length > 1;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {symbols.map((symbol) => (
        <li key={symbol}>
          <StockCard
            symbol={symbol}
            selected={symbol === selected}
            onSelect={onSelect}
            onRemove={removable ? onRemove : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
