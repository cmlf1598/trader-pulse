const LOCALE = "es-ES";

export function formatPrice(value: number, currency: string | null): string {
  const digits = Math.abs(value) < 1 ? 6 : 2;
  return new Intl.NumberFormat(LOCALE, {
    ...(currency ? { style: "currency", currency } : {}),
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatChange(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(LOCALE, {
    signDisplay: "exceptZero",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) < 0.01 ? 6 : 2,
  }).format(value);
}

export function formatVolume(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export function formatAxisTime(iso: string, intraday: boolean): string {
  return new Intl.DateTimeFormat(
    LOCALE,
    intraday ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" },
  ).format(new Date(iso));
}

export type Trend = "up" | "down" | "flat";

export function trendOf(change: number | null): Trend {
  if (change === null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

export const TREND_TEXT: Record<Trend, string> = {
  up: "text-bull",
  down: "text-bear",
  flat: "text-muted-foreground",
};
