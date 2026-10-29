import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { formatPercent, TREND_TEXT, trendOf } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

export function PriceChange({
  percent,
  className,
}: {
  percent: number | null;
  className?: string;
}) {
  const trend = trendOf(percent);
  const Icon = ICONS[trend];
  return (
    <span
      data-trend={trend}
      className={cn("inline-flex items-center gap-0.5 tabular-nums", TREND_TEXT[trend], className)}
    >
      <Icon aria-hidden className="size-3.5" />
      {formatPercent(percent)}
    </span>
  );
}
