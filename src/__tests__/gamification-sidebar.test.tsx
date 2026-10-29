import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GamificationSidebar } from "@/components/dashboard/gamification-sidebar";

import { apiError, gamificationFixture, json, never, renderWithSWR, stubApi } from "./test-utils";

describe("GamificationSidebar", () => {
  it("shows investor level, analysis points and badges", async () => {
    stubApi(() => json(gamificationFixture()));

    renderWithSWR(<GamificationSidebar />);

    expect(await screen.findByText("Analista")).toBeInTheDocument();
    expect(screen.getByText("Nivel de Inversionista")).toBeInTheDocument();
    expect(screen.getByText("Puntos de Análisis")).toBeInTheDocument();
    expect(screen.getByTestId("points")).toHaveTextContent("120");
    expect(screen.getByText("30 pts para el siguiente nivel")).toBeInTheDocument();
    expect(screen.getByText("Primer análisis").closest("li")).toHaveAttribute(
      "data-earned",
      "true",
    );
    expect(screen.getByText("Explorador de mercados").closest("li")).toHaveAttribute(
      "data-earned",
      "false",
    );
  });

  it("handles the maximum level", async () => {
    stubApi(() =>
      json(
        gamificationFixture({
          level: 5,
          level_name: "Leyenda",
          next_level_points: null,
          progress: 1,
        }),
      ),
    );

    renderWithSWR(<GamificationSidebar />);

    expect(await screen.findByText("Nivel máximo alcanzado")).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    stubApi(never);

    renderWithSWR(<GamificationSidebar />);

    expect(screen.getByRole("status", { name: "Cargando progreso" })).toBeInTheDocument();
  });

  it("keeps the level, progress bar, points and badges sections while loading", () => {
    stubApi(never);

    renderWithSWR(<GamificationSidebar />);

    expect(screen.getByText("Nivel de Inversionista")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progreso al siguiente nivel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Puntos de Análisis")).toBeInTheDocument();
    expect(screen.getByText("Insignias")).toBeInTheDocument();
  });

  it("shows points as XP", async () => {
    stubApi(() => json(gamificationFixture()));

    renderWithSWR(<GamificationSidebar />);

    expect(await screen.findByTestId("points")).toHaveTextContent("120 XP");
  });

  it("shows the error message on failure", async () => {
    stubApi(() => apiError(500, "internal_error", "Ocurrió un error inesperado."));

    renderWithSWR(<GamificationSidebar />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado.");
  });
});
