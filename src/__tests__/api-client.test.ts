import { describe, expect, it } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

import { apiError, json, quoteFixture, requestedPaths, stubApi } from "./test-utils";

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("api client", () => {
  it("returns validated data on success", async () => {
    stubApi(() => json(quoteFixture()));

    await expect(api.quote("AAPL")).resolves.toEqual(quoteFixture());
  });

  it("URL-encodes symbols and builds query strings", async () => {
    const fetchMock = stubApi((path) =>
      path.includes("history")
        ? json({ symbol: "^GSPC", range: "1y", interval: "1wk", points: [] })
        : json({}),
    );

    await api.history("^GSPC", "1y");

    expect(requestedPaths(fetchMock)).toEqual(["/api/v1/stocks/%5EGSPC/history?range=1y"]);
  });

  it("maps the backend error envelope to ApiError", async () => {
    stubApi(() => apiError(404, "symbol_not_found", "No se encontró el símbolo «ZZZZ»."));

    const error = await caught(api.quote("ZZZZ"));

    expect(error.status).toBe(404);
    expect(error.code).toBe("symbol_not_found");
    expect(error.message).toBe("No se encontró el símbolo «ZZZZ».");
    expect(error.isClientError).toBe(true);
  });

  it("reads Retry-After on rate limiting", async () => {
    stubApi(() =>
      json({ error: { code: "rate_limited", message: "Espera." } }, 503, { "Retry-After": "30" }),
    );

    const error = await caught(api.quote("AAPL"));

    expect(error.retryAfterSeconds).toBe(30);
    expect(error.isClientError).toBe(false);
  });

  it("falls back to a Spanish message when the error body is not the envelope", async () => {
    stubApi(() => new Response("<html>Bad Gateway</html>", { status: 502 }));

    const error = await caught(api.quote("AAPL"));

    expect(error.code).toBe("http_502");
    expect(error.message).toBe("Ocurrió un error inesperado.");
  });

  it("reports network failures", async () => {
    stubApi(() => {
      throw new TypeError("Failed to fetch");
    });

    const error = await caught(api.quote("AAPL"));

    expect(error.code).toBe("network_error");
    expect(error.message).toBe("No se pudo conectar con el servidor de TraderPulse.");
  });

  it("rejects payloads that break the contract instead of returning them", async () => {
    stubApi(() => json({ symbol: "AAPL", price: "not-a-number" }));

    const error = await caught(api.quote("AAPL"));

    expect(error.code).toBe("invalid_response");
  });

  it("asks for a fresh analysis with ?refresh=true", async () => {
    const fetchMock = stubApi(() => json({}));

    await api.sentiment("AAPL", { refresh: true }).catch(() => undefined);

    expect(requestedPaths(fetchMock)).toEqual(["/api/v1/sentiment/AAPL?refresh=true"]);
  });
});
