import { toast } from "sonner";

import { errorMessage } from "@/lib/api/errors";
import type { GamificationStatus } from "@/lib/api/schemas";
import { newlyEarnedBadges } from "@/lib/gamification";

export function notifyXpGained(symbol: string, points: number | undefined): void {
  toast.success("¡XP ganada!", {
    description:
      points === undefined
        ? `Análisis de ${symbol} completado.`
        : `+${points} Puntos de Análisis por analizar ${symbol}.`,
  });
}

/** Celebrates level-ups and badges that appear between two server snapshots. */
export function notifyProgress(before: GamificationStatus, after: GamificationStatus): void {
  if (after.level > before.level) {
    toast.success("¡Subiste de nivel!", {
      description: `Ahora eres ${after.level_name} (nivel ${after.level}).`,
    });
  }
  for (const badge of newlyEarnedBadges(before, after)) {
    toast.success(`Insignia desbloqueada: ${badge.name}`, { description: badge.description });
  }
}

/**
 * Shows an error toast. `id` deduplicates: a failing 60s poll updates one toast
 * instead of stacking a new one every minute.
 */
export function notifyError(error: unknown, id?: string, title?: string): void {
  const message = errorMessage(error);
  if (title) {
    toast.error(title, { id, description: message });
  } else {
    toast.error(message, { id });
  }
}
