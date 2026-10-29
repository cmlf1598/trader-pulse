import { Activity } from "lucide-react";

import { Dashboard } from "@/components/dashboard/dashboard";
import { SECTIONS } from "@/components/dashboard/sections";

// Server Component: renders the static shell (prerendered at build time, no backend calls).
// All live data is fetched in the browser by the <Dashboard /> client island via SWR.
export default function Page() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
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
        <nav aria-label="Secciones" className="flex items-center gap-1 text-sm">
          {Object.values(SECTIONS).map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <p className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
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
