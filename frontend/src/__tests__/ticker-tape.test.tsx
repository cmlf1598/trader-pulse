import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TickerTape } from "@/components/dashboard/ticker-tape";

import { apiError, json, quoteFixture, renderWithSWR, stubApi } from "./test-utils";

function stubQuotes() {
  stubApi((path) => {
    const symbol = decodeURIComponent(path.split("/").pop()!);
    return symbol === "DEAD"
      ? apiError(404, "symbol_not_found", "No encontrado")
      : json(quoteFixture(symbol, { change_percent: symbol === "MSFT" ? -2.5 : 1.25 }));
  });
}

describe("TickerTape", () => {
  it("shows live prices for each symbol", async () => {
    stubQuotes();

    renderWithSWR(<TickerTape symbols={["AAPL", "MSFT"]} selected="AAPL" onSelect={vi.fn()} />);

    const msft = screen.getByRole("button", { name: /^MSFT/ });
    expect(await screen.findByRole("button", { name: /^MSFT.*110,00/ })).toBe(msft);
    expect(msft.querySelector("[data-trend]")).toHaveAttribute("data-trend", "down");
    expect(
      screen.getByRole("button", { name: /^AAPL/ }).querySelector("[data-trend]"),
    ).toHaveAttribute("data-trend", "up");
  });

  it("clicking a symbol selects it", async () => {
    stubQuotes();
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithSWR(<TickerTape symbols={["AAPL", "MSFT"]} selected="AAPL" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /^MSFT/ }));

    expect(onSelect).toHaveBeenCalledWith("MSFT");
  });

  it("marks the selected symbol and keeps the duplicate track out of the a11y tree", () => {
    stubQuotes();

    renderWithSWR(<TickerTape symbols={["AAPL", "MSFT"]} selected="MSFT" onSelect={vi.fn()} />);

    // Two tracks are rendered for the seamless loop, but only one is accessible.
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^MSFT/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^AAPL/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a placeholder when a quote fails", async () => {
    stubQuotes();

    renderWithSWR(<TickerTape symbols={["DEAD"]} selected="DEAD" onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /^DEAD.*sin datos/ })).toBeInTheDocument();
  });
});
