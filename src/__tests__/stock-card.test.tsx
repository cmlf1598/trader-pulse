import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StockCard } from "@/components/dashboard/stock-card";

import {
  apiError,
  historyFixture,
  json,
  never,
  quoteFixture,
  renderWithSWR,
  stubApi,
} from "./test-utils";

function renderCard(props: Partial<Parameters<typeof StockCard>[0]> = {}) {
  const onSelect = vi.fn();
  const onRemove = vi.fn();
  renderWithSWR(
    <StockCard symbol="AAPL" selected={false} onSelect={onSelect} onRemove={onRemove} {...props} />,
  );
  return { onSelect, onRemove, user: userEvent.setup() };
}

describe("StockCard", () => {
  it("renders price, change and volume on success", async () => {
    stubApi((path) => (path.includes("history") ? json(historyFixture()) : json(quoteFixture())));

    renderCard();

    expect(await screen.findByText(/110,00/)).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText(/\+10,00\s?%/)).toBeInTheDocument();
    expect(screen.getByText(/Vol\. 1,2\s?M/)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    stubApi(never);

    renderCard();

    expect(screen.getByRole("status", { name: "Cargando AAPL" })).toBeInTheDocument();
  });

  it("shows the API error message when the quote fails", async () => {
    stubApi(() =>
      apiError(502, "market_unavailable", "El servicio de datos de mercado no está disponible."),
    );

    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servicio de datos de mercado no está disponible.",
    );
  });

  it("selects on click and removes via its own button", async () => {
    stubApi(() => json(quoteFixture()));
    const { onSelect, onRemove, user } = renderCard();

    await user.click(screen.getByRole("button", { name: "Ver AAPL (Apple)" }));
    await user.click(screen.getByRole("button", { name: "Quitar AAPL de la lista" }));

    expect(onSelect).toHaveBeenCalledWith("AAPL");
    expect(onRemove).toHaveBeenCalledWith("AAPL");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("reflects the selected state", () => {
    stubApi(never);

    renderCard({ selected: true, onRemove: undefined });

    expect(screen.getByRole("button", { name: "Ver AAPL (Apple)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
  });
});
