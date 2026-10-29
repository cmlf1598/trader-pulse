import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { SymbolSearch } from "@/components/dashboard/symbol-search";

import { apiError, json, quoteFixture, renderWithSWR, stubApi } from "./test-utils";

function setup(watchlist: string[] = ["AAPL"]) {
  const onAdd = vi.fn();
  renderWithSWR(<SymbolSearch watchlist={watchlist} onAdd={onAdd} />);
  return { onAdd, user: userEvent.setup(), input: screen.getByLabelText("Buscar símbolo") };
}

describe("SymbolSearch", () => {
  it("adds a symbol after the backend confirms it (normalized to upper case)", async () => {
    stubApi(() => json(quoteFixture("META")));
    const { onAdd, user, input } = setup();

    await user.type(input, " meta ");
    await user.click(screen.getByRole("button", { name: "Añadir" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("META"));
    expect(toast.success).toHaveBeenCalledWith("META añadido a tu lista", { id: "symbol-search" });
    expect(input).toHaveValue("");
  });

  it("shows a 'Símbolo no encontrado' toast on 404 and does not add it", async () => {
    stubApi(() => apiError(404, "symbol_not_found", "No se encontró el símbolo «ZZZZ»."));
    const { onAdd, user, input } = setup();

    await user.type(input, "zzzz{Enter}");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Símbolo no encontrado: ZZZZ", {
        id: "symbol-search",
        description: "No se encontró el símbolo «ZZZZ».",
      }),
    );
    expect(onAdd).not.toHaveBeenCalled();
    expect(input).toHaveValue("zzzz");
  });

  it("reports other failures with a generic title", async () => {
    stubApi(() => apiError(504, "upstream_timeout", "El proveedor tardó demasiado."));
    const { user, input } = setup();

    await user.type(input, "MSFT{Enter}");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No se pudo añadir MSFT", expect.anything()),
    );
  });

  it("rejects malformed symbols without calling the API", async () => {
    const fetchMock = stubApi(() => json({}));
    const { onAdd, user, input } = setup();

    await user.type(input, "AA$PL{Enter}");

    expect(toast.error).toHaveBeenCalledWith("Símbolo inválido", expect.anything());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("selects an already-watched symbol without refetching", async () => {
    const fetchMock = stubApi(() => json({}));
    const { onAdd, user, input } = setup(["AAPL", "MSFT"]);

    await user.type(input, "msft{Enter}");

    expect(onAdd).toHaveBeenCalledWith("MSFT");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
