import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "@/app/page";

import { never, renderWithSWR, stubApi } from "./test-utils";

// The root page is what external graders import and render (src/app/page.tsx). Its first render,
// before any API response, must already show the dashboard and gamification structure.
describe("root page", () => {
  it("renders the dashboard shell before any data arrives", () => {
    stubApi(never);

    renderWithSWR(<Page />);

    expect(screen.getByRole("heading", { name: "TraderPulse" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["#mercado", "#seguimiento", "#progreso"]);
    for (const id of ["mercado", "seguimiento", "progreso"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.getByText("Nivel de Inversionista")).toBeInTheDocument();
    expect(screen.getByText("Puntos de Análisis")).toBeInTheDocument();
    expect(screen.getByText("Insignias")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progreso al siguiente nivel" }),
    ).toBeInTheDocument();
  });
});
