import { Activity } from "lucide-react";

import { Dashboard } from "@/components/dashboard/dashboard";

// Server Component: renders the static shell (prerendered at build time, no backend calls).
// All live data is fetched in the browser by the <Dashboard /> client island via SWR.
export default function Page() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Activity aria-hidden className="size-5" />
          </span>
          <div>
            <h1 className="text-lg leading-tight font-semibold">TraderPulse</h1>
            <p className="text-xs text-muted-foreground">
              Análisis de mercado en tiempo real con IA
            </p>
          </div>
        </div>
        <p className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-bull opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-bull" />
          </span>
          Datos de Yahoo Finance · actualización cada minuto
        </p>
      </header>

      <main className="flex-1">
        <Dashboard />
      </main>

      <footer className="mx-auto w-full max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
        TraderPulse muestra datos con fines informativos. Las cotizaciones pueden tener retraso y el
        análisis de IA no constituye asesoramiento financiero.
      </footer>
    </div>
  );
}
