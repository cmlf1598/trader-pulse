"use client";

import { AlertTriangle } from "lucide-react";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isIntraday, useHistory } from "@/hooks/use-history";
import { useQuote } from "@/hooks/use-quote";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/api/schemas";
import { formatAxisTime, formatDateTime, formatPrice } from "@/lib/format";
import { SYMBOL_NAMES } from "@/lib/symbols";

import { PriceChange } from "./price-change";

export const RANGE_LABELS: Record<HistoryRange, string> = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "6mo": "6M",
  "1y": "1A",
};

type PriceChartProps = {
  symbol: string;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
};

export function PriceChart({ symbol, range, onRangeChange }: PriceChartProps) {
  const { data: quote } = useQuote(symbol);
  const { data: history, error, isLoading } = useHistory(symbol, range);
  const gradientId = useId();

  const points = history?.symbol === symbol ? history.points : [];
  const up = points.length > 1 && points.at(-1)!.close >= points[0].close;
  const color = up ? "var(--bull)" : "var(--bear)";
  const intraday = isIntraday(range);
  const currency = quote?.currency ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-semibold" data-testid="chart-symbol">
              {symbol}
            </span>
            {SYMBOL_NAMES[symbol] && (
              <span className="text-sm font-normal text-muted-foreground">
                {SYMBOL_NAMES[symbol]}
              </span>
            )}
          </CardTitle>
          {quote?.symbol === symbol && (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatPrice(quote.price, quote.currency)}
              </span>
              <PriceChange percent={quote.change_percent} className="text-base" />
            </div>
          )}
        </div>
        <div role="group" aria-label="Rango temporal" className="flex shrink-0 gap-1">
          {HISTORY_RANGES.map((value) => (
            <Button
              key={value}
              size="xs"
              variant={value === range ? "secondary" : "ghost"}
              aria-pressed={value === range}
              onClick={() => onRangeChange(value)}
            >
              {RANGE_LABELS[value]}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-72 w-full">
          {points.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickFormatter={(value: string) => formatAxisTime(value, intraday)}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) => formatPrice(value, null)}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  orientation="right"
                />
                <Tooltip
                  content={(props) => <ChartTooltip {...props} currency={currency} />}
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : error ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <AlertTriangle aria-hidden className="size-6 text-destructive" />
              {error.message}
            </div>
          ) : isLoading || !history ? (
            <Skeleton className="h-full w-full" role="status" aria-label="Cargando gráfico" />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No hay suficientes datos para este rango.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  currency,
}: Pick<TooltipContentProps, "active" | "payload"> & { currency: string | null }) {
  const point = payload?.[0]?.payload as { time: string; close: number } | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{formatDateTime(point.time)}</p>
      <p className="font-semibold tabular-nums">{formatPrice(point.close, currency)}</p>
    </div>
  );
}
