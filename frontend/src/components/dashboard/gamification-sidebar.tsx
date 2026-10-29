"use client";

import {
  Award,
  Coins,
  Compass,
  Flame,
  Lock,
  Sparkles,
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
  consistent: Flame,
  explorer: Compass,
  crypto_curious: Coins,
  strategist: Trophy,
};

const numberFormat = new Intl.NumberFormat("es-ES");

export function GamificationSidebar() {
  const { data: status, error } = useGamification();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award aria-hidden className="size-4 text-primary" />
          Tu progreso
        </CardTitle>
        <CardDescription>Gana puntos con cada análisis de IA.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {status ? (
          <>
            <section aria-labelledby="investor-level" className="space-y-2">
              <h3
                id="investor-level"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Nivel de Inversionista
              </h3>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold">{status.level_name}</p>
                <span className="text-sm text-muted-foreground">Nivel {status.level}</span>
              </div>
              <Progress
                value={Math.round(status.progress * 100)}
                aria-label="Progreso al siguiente nivel"
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {status.next_level_points === null
                  ? "Nivel máximo alcanzado"
                  : `${numberFormat.format(status.next_level_points - status.points)} pts para el siguiente nivel`}
              </p>
            </section>

            <Separator />

            <section aria-labelledby="analysis-points" className="space-y-1">
              <h3
                id="analysis-points"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Puntos de Análisis
              </h3>
              <p className="text-3xl font-semibold text-primary tabular-nums" data-testid="points">
                {numberFormat.format(status.points)}
              </p>
              <p className="text-xs text-muted-foreground">
                {status.analyses_count} análisis realizados
              </p>
            </section>

            <Separator />

            <section aria-labelledby="badges" className="space-y-2">
              <h3
                id="badges"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Insignias
              </h3>
              <ul className="space-y-2">
                {status.badges.map((badge) => {
                  const Icon = badge.earned ? (BADGE_ICONS[badge.id] ?? Award) : Lock;
                  return (
                    <li
                      key={badge.id}
                      data-earned={badge.earned}
                      title={badge.description}
                      className={cn(
                        "flex items-center gap-3 text-sm",
                        !badge.earned && "opacity-50",
                      )}
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
            </section>
          </>
        ) : error ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {error.message}
          </p>
        ) : (
          <div className="space-y-3" role="status" aria-label="Cargando progreso">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
