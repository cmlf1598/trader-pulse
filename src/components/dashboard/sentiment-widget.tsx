"use client";

import {
  AlertTriangle,
  BrainCircuit,
  Database,
  ExternalLink,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentiment } from "@/hooks/use-sentiment";
import type { Sentiment, SentimentAnalysis } from "@/lib/api/schemas";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const SENTIMENT_STYLES = {
  bullish: {
    label: "Alcista",
    icon: TrendingUp,
    text: "text-bull",
    surface: "bg-bull/10 ring-bull/30",
    bar: "[&_[data-slot=progress-indicator]]:bg-bull",
  },
  bearish: {
    label: "Bajista",
    icon: TrendingDown,
    text: "text-bear",
    surface: "bg-bear/10 ring-bear/30",
    bar: "[&_[data-slot=progress-indicator]]:bg-bear",
  },
  neutral: {
    label: "Neutral",
    icon: Minus,
    text: "text-flat",
    surface: "bg-flat/10 ring-flat/30",
    bar: "[&_[data-slot=progress-indicator]]:bg-flat",
  },
} as const satisfies Record<Sentiment, object>;

export function SentimentWidget({ symbol }: { symbol: string }) {
  const { data, error, isLoading, mutate, reanalyze, isReanalyzing } = useSentiment(symbol);
  const analysis = data?.symbol === symbol ? data : undefined;
  const busy = isLoading || isReanalyzing;

  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit aria-hidden className="size-4 text-primary" />
          Análisis de sentimiento IA
        </CardTitle>
        <CardDescription>Gemini evalúa precio y titulares recientes de {symbol}.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => void reanalyze()} disabled={busy}>
            <RefreshCw data-icon="inline-start" className={cn(busy && "animate-spin")} />
            Reanalizar
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {analysis ? (
          <AnalysisView analysis={analysis} dimmed={isReanalyzing} />
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle aria-hidden className="size-4" />
              No se pudo generar el análisis
            </p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button size="sm" variant="outline" onClick={() => void mutate()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div role="status" aria-label="Analizando con Gemini…" className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
      </CardContent>

      <CardFooter className="text-xs text-muted-foreground">
        Análisis informativo generado por IA. No constituye asesoramiento financiero.
      </CardFooter>
    </Card>
  );
}

function AnalysisView({ analysis, dimmed }: { analysis: SentimentAnalysis; dimmed: boolean }) {
  const style = SENTIMENT_STYLES[analysis.sentiment];
  const Icon = style.icon;
  const confidence = Math.round(analysis.confidence * 100);

  return (
    <div className={cn("space-y-4 transition-opacity", dimmed && "opacity-60")} aria-live="polite">
      <div
        data-testid="sentiment-verdict"
        data-sentiment={analysis.sentiment}
        className={cn("flex items-center gap-4 rounded-xl p-4 ring-1", style.surface)}
      >
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full bg-background/40",
            style.text,
          )}
        >
          <Icon aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-2xl font-semibold", style.text)}>{style.label}</p>
            {analysis.cached && (
              <Badge variant="outline" title="Resultado reutilizado de un análisis reciente">
                <Database aria-hidden />
                En caché
              </Badge>
            )}
          </div>
          <Progress value={confidence} aria-label="Confianza del análisis" className={style.bar} />
          <p className="text-xs text-muted-foreground tabular-nums">Confianza: {confidence}%</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed">{analysis.justification}</p>

      {analysis.key_factors.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Factores clave">
          {analysis.key_factors.map((factor) => (
            <li key={factor}>
              <Badge variant="secondary">{factor}</Badge>
            </li>
          ))}
        </ul>
      )}

      {analysis.headlines.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Titulares analizados
          </p>
          <ul className="space-y-1.5 text-sm">
            {analysis.headlines.slice(0, 5).map((headline) => (
              <li key={headline.title} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">
                  •
                </span>
                {headline.url ? (
                  <a
                    href={headline.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-start gap-1 hover:text-primary"
                  >
                    <span>{headline.title}</span>
                    <ExternalLink
                      aria-hidden
                      className="mt-0.5 size-3 shrink-0 opacity-50 group-hover:opacity-100"
                    />
                  </a>
                ) : (
                  <span>{headline.title}</span>
                )}
                {headline.publisher && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {headline.publisher}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {analysis.model} · {formatDateTime(analysis.generated_at)}
      </p>
    </div>
  );
}
