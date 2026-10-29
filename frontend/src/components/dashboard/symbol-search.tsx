"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import { notifyError } from "@/lib/notify";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbols";

type SymbolSearchProps = {
  watchlist: readonly string[];
  onAdd: (symbol: string) => void;
};

/** Adds a symbol to the watchlist only after the backend confirms it exists. */
export function SymbolSearch({ watchlist, onAdd }: SymbolSearchProps) {
  const { mutate } = useSWRConfig();
  const [value, setValue] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = normalizeSymbol(value);
    if (!symbol) return;

    if (!isValidSymbol(symbol)) {
      toast.error("Símbolo inválido", {
        id: "symbol-search",
        description: "Usa letras, números y . - = ^ (p. ej. AAPL, BTC-USD).",
      });
      return;
    }
    if (watchlist.includes(symbol)) {
      onAdd(symbol);
      setValue("");
      return;
    }

    setIsChecking(true);
    try {
      // Validates the symbol and primes the SWR cache so the new card renders instantly.
      await mutate(keys.quote(symbol), api.quote(symbol), { revalidate: false });
      onAdd(symbol);
      setValue("");
      toast.success(`${symbol} añadido a tu lista`, { id: "symbol-search" });
    } catch (error) {
      const title =
        error instanceof ApiError && error.code === "symbol_not_found"
          ? `Símbolo no encontrado: ${symbol}`
          : `No se pudo añadir ${symbol}`;
      notifyError(error, "symbol-search", title);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="flex w-full max-w-md gap-2">
      <div className="relative flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Buscar símbolo"
          placeholder="Añadir símbolo (AAPL, BTC-USD…)"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="pl-8 uppercase placeholder:normal-case"
          autoComplete="off"
          spellCheck={false}
          maxLength={15}
        />
      </div>
      <Button type="submit" disabled={isChecking || !value.trim()}>
        {isChecking ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        Añadir
      </Button>
    </form>
  );
}
