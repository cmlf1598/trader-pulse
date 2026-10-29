"use client";

import { useQuote } from "@/hooks/use-quote";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PriceChange } from "./price-change";

type TickerTapeProps = {
  symbols: readonly string[];
  selected: string;
  onSelect: (symbol: string) => void;
};

/**
 * Infinite marquee of live quotes. The track is rendered twice and translated by -50% so the
 * loop is seamless; the duplicate copy is hidden from assistive tech and the tab order.
 */
export function TickerTape({ symbols, selected, onSelect }: TickerTapeProps) {
  const duration = `${Math.max(symbols.length * 5, 20)}s`;

  return (
    <nav
      aria-label="Cinta de cotizaciones"
      className="group relative overflow-hidden border-y bg-card/60 backdrop-blur"
    >
      <div
        className="flex w-max animate-marquee group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
        style={{ "--marquee-duration": duration } as React.CSSProperties}
      >
        {[false, true].map((duplicate) => (
          <ul
            key={String(duplicate)}
            aria-hidden={duplicate || undefined}
            className="flex shrink-0 items-center"
          >
            {symbols.map((symbol) => (
              <li key={symbol}>
                <TickerItem
                  symbol={symbol}
                  active={symbol === selected}
                  onSelect={onSelect}
                  focusable={!duplicate}
                />
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background to-transparent" />
    </nav>
  );
}

function TickerItem({
  symbol,
  active,
  focusable,
  onSelect,
}: {
  symbol: string;
  active: boolean;
  focusable: boolean;
  onSelect: (symbol: string) => void;
}) {
  const { data: quote, error } = useQuote(symbol);

  return (
    <button
      type="button"
      tabIndex={focusable ? 0 : -1}
      aria-pressed={active}
      onClick={() => onSelect(symbol)}
      className={cn(
        "flex items-center gap-2 border-r px-5 py-2.5 text-sm whitespace-nowrap transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        active && "bg-accent",
      )}
    >
      <span className={cn("font-semibold", active && "text-primary")}>{symbol}</span>
      {quote ? (
        <>
          <span className="text-muted-foreground tabular-nums">
            {formatPrice(quote.price, quote.currency)}
          </span>
          <PriceChange percent={quote.change_percent} className="text-xs" />
        </>
      ) : (
        <span className="text-xs text-muted-foreground">{error ? "sin datos" : "…"}</span>
      )}
    </button>
  );
}
