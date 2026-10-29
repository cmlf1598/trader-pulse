"use client";

import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/hooks/use-history";
import { useQuote } from "@/hooks/use-quote";
import { formatChange, formatPrice, formatVolume, TREND_TEXT, trendOf } from "@/lib/format";
import { SYMBOL_NAMES } from "@/lib/symbols";
import { cn } from "@/lib/utils";

import { PriceChange } from "./price-change";
import { Sparkline } from "./sparkline";

type StockCardProps = {
  symbol: string;
  selected: boolean;
  onSelect: (symbol: string) => void;
  onRemove?: (symbol: string) => void;
};

export function StockCard({ symbol, selected, onSelect, onRemove }: StockCardProps) {
  const { data: quote, error, isLoading } = useQuote(symbol);
  const { data: history } = useHistory(symbol, "5d");
  const name = SYMBOL_NAMES[symbol];

  return (
    <Card
      size="sm"
      data-selected={selected}
      className={cn(
        "relative transition-shadow hover:ring-foreground/20",
        selected && "ring-2 ring-primary/70 hover:ring-primary/70",
      )}
    >
      {/* Stretched button: the whole card selects the symbol, the remove button sits above it. */}
      <button
        type="button"
        onClick={() => onSelect(symbol)}
        aria-pressed={selected}
        aria-label={`Ver ${symbol}${name ? ` (${name})` : ""}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <CardContent className="pointer-events-none relative space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{symbol}</p>
            {name && <p className="truncate text-xs text-muted-foreground">{name}</p>}
          </div>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Quitar ${symbol} de la lista`}
              className="pointer-events-auto relative z-10 -mt-1 -mr-1 text-muted-foreground"
              onClick={() => onRemove(symbol)}
            >
              <X />
            </Button>
          )}
        </div>

        {quote ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {formatPrice(quote.price, quote.currency)}
              </span>
              <PriceChange percent={quote.change_percent} className="text-sm" />
            </div>
            {history && history.points.length > 1 ? (
              <Sparkline history={history} />
            ) : (
              <div className="h-10" />
            )}
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                Var.{" "}
                <span className={TREND_TEXT[trendOf(quote.change)]}>
                  {formatChange(quote.change)}
                </span>
              </span>
              <span>Vol. {formatVolume(quote.volume)}</span>
            </div>
          </>
        ) : error ? (
          <p role="alert" className="flex items-center gap-1.5 py-6 text-sm text-destructive">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {error.message}
          </p>
        ) : isLoading ? (
          <div className="space-y-2" aria-label={`Cargando ${symbol}`} role="status">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
