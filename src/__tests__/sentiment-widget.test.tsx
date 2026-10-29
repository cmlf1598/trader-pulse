import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it } from "vitest";

import { SentimentWidget } from "@/components/dashboard/sentiment-widget";
import type { Sentiment } from "@/lib/api/schemas";

import {
  apiError,
  gamificationFixture,
  json,
  never,
  renderWithSWR,
  requestedPaths,
  sentimentFixture,
  stubApi,
} from "./test-utils";

describe("SentimentWidget", () => {
  it.each<[Sentiment, string, string]>([
    ["bullish", "Alcista", "text-bull"],
    ["bearish", "Bajista", "text-bear"],
    ["neutral", "Neutral", "text-flat"],
  ])("renders %s as a color-coded %s verdict", async (sentiment, label, colorClass) => {
    stubApi((path) =>
      path.includes("gamification")
        ? json(gamificationFixture())
        : json(sentimentFixture(sentiment)),
    );

    renderWithSWR(<SentimentWidget symbol="AAPL" />);

    const verdict = await screen.findByTestId("sentiment-verdict");
    expect(verdict).toHaveAttribute("data-sentiment", sentiment);
    expect(screen.getByText(label)).toHaveClass(colorClass);
  });

  it("shows confidence, justification, factors and headlines", async () => {
    stubApi((path) =>
      path.includes("gamification") ? json(gamificationFixture()) : json(sentimentFixture()),
    );

    renderWithSWR(<SentimentWidget symbol="AAPL" />);

    expect(await screen.findByText("Confianza: 82%")).toBeInTheDocument();
    expect(screen.getByText(/El precio sube con fuerza/)).toBeInTheDocument();
    expect(screen.getByText("Tendencia alcista")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apple bate expectativas/ })).toHaveAttribute(
      "href",
      "https://x.test/a",
    );
    expect(screen.queryByText("En caché")).not.toBeInTheDocument();
  });

  it("flags cached results", async () => {
    stubApi(() => json(sentimentFixture("neutral", { cached: true })));

    renderWithSWR(<SentimentWidget symbol="AAPL" />);

    expect(await screen.findByText("En caché")).toBeInTheDocument();
  });

  it("shows a loading state while Gemini works", () => {
    stubApi(never);

    renderWithSWR(<SentimentWidget symbol="AAPL" />);

    expect(screen.getByRole("status", { name: "Analizando con Gemini…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanalizar" })).toBeDisabled();
  });

  it("shows an error state and a toast when the AI fails — no fallback data", async () => {
    stubApi(() =>
      apiError(502, "ai_unavailable", "El análisis de IA no está disponible en este momento."),
    );

    renderWithSWR(<SentimentWidget symbol="AAPL" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo generar el análisis");
    expect(screen.queryByTestId("sentiment-verdict")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "El análisis de IA no está disponible en este momento.",
      expect.anything(),
    );
  });

  it("Reanalizar requests a fresh analysis", async () => {
    const fetchMock = stubApi((path) => {
      if (path.includes("gamification")) return json(gamificationFixture());
      return path.endsWith("refresh=true")
        ? json(sentimentFixture("bearish"))
        : json(sentimentFixture("bullish", { cached: true }));
    });
    const user = userEvent.setup();
    renderWithSWR(<SentimentWidget symbol="AAPL" />);
    await screen.findByText("Alcista");

    await user.click(screen.getByRole("button", { name: "Reanalizar" }));

    expect(await screen.findByText("Bajista")).toBeInTheDocument();
    await waitFor(() =>
      expect(requestedPaths(fetchMock)).toContain("/api/v1/sentiment/AAPL?refresh=true"),
    );
  });
});
