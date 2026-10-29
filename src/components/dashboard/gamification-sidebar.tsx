"use client";

import {
  Award,
  Coins,
  Compass,
  Flame,
  Lock,
  Sparkles,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useGamification } from "@/hooks/use-gamification";
import { cn } from "@/lib/utils";

const BADGE_ICONS: Record<string, LucideIcon> = {
  first_analysis: Sparkles,
  bull_market_expert: TrendingUp,
  consistent: Flame,
  explorer: Compass,
  crypto_curious: Coins,
  strategist: Trophy,
};

const numberFormat = new Intl.NumberFormat("es-ES");

const sectionTitle = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

/** Stand-in for a value that has not arrived: a skeleton while loading, a dash after a failure. */
function Pending({ failed, className }: { failed: boolean; className: string }) {
  return failed ? (
    <p className="text-2xl font-semibold text-muted-foreground">—</p>
  ) : (
    <Skeleton className={className} />
  );
}

export function GamificationSidebar() {
  const { data: status, error } = useGamification();
  const failed = !status && Boolean(error);
  const loading = !status && !error;

  // The section structure (level, progress bar, points, badges) renders immediately; only the
  // values wait for the API, so the layout never jumps and the sidebar reads well while loading.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award aria-hidden className="size-4 text-primary" />
          Tu progreso
        </CardTitle>
        <CardDescription>Gana XP (Puntos de Análisis) con cada análisis de IA.</CardDescription>
      </CardHeader>

      <CardContent
        className="space-y-5"
        aria-busy={loading}
        {...(loading && { role: "status", "aria-label": "Cargando progreso" })}
      >
        {failed && (
          <p role="alert" className="text-sm text-muted-foreground">
            {error?.message}
          </p>
        )}

        <section aria-labelledby="investor-level" className="space-y-2">
          <h3 id="investor-level" className={sectionTitle}>
            Nivel de Inversionista
          </h3>
          {status ? (
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-semibold">{status.level_name}</p>
              <span className="text-sm text-muted-foreground">Nivel {status.level}</span>
            </div>
          ) : (
            <Pending failed={failed} className="h-8 w-32" />
          )}
          <Progress
            value={status ? Math.round(status.progress * 100) : null}
            aria-label="Progreso al siguiente nivel"
          />
          {status && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {status.next_level_points === null
                ? "Nivel máximo alcanzado"
                : `${numberFormat.format(status.next_level_points - status.points)} pts para el siguiente nivel`}
            </p>
          )}
        </section>

        <Separator />

        <section aria-labelledby="analysis-points" className="space-y-1">
          <h3 id="analysis-points" className={sectionTitle}>
            Puntos de Análisis
          </h3>
          {status ? (
            <>
              <p className="text-3xl font-semibold text-primary tabular-nums" data-testid="points">
                {numberFormat.format(status.points)}{" "}
                <span className="text-base font-medium text-muted-foreground">XP</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {status.analyses_count} análisis realizados
              </p>
            </>
          ) : (
            <Pending failed={failed} className="h-10 w-24" />
          )}
        </section>

        <Separator />

        <section aria-labelledby="badges" className="space-y-2">
          <h3 id="badges" className={sectionTitle}>
            Insignias
          </h3>
          {status ? (
            <ul className="space-y-2">
              {status.badges.map((badge) => {
                const Icon = badge.earned ? (BADGE_ICONS[badge.id] ?? Award) : Lock;
                return (
                  <li
                    key={badge.id}
                    data-earned={badge.earned}
                    title={badge.description}
                    className={cn("flex items-center gap-3 text-sm", !badge.earned && "opacity-50")}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        badge.earned
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{badge.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {badge.earned ? "Desbloqueada" : badge.description}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Pending failed={failed} className="h-24 w-full" />
          )}
        </section>
      </CardContent>
    </Card>
  );
}
