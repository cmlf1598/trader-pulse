/** Error raised by every API call; `code` mirrors the backend error envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

// Used only when the backend did not send its own (Spanish) message, e.g. a proxy error page.
export const FALLBACK_MESSAGES: Record<string, string> = {
  symbol_not_found: "Símbolo no encontrado.",
  invalid_symbol: "El símbolo no es válido.",
  market_unavailable: "El servicio de datos de mercado no está disponible.",
  rate_limited: "Demasiadas solicitudes. Inténtalo de nuevo en un minuto.",
  upstream_timeout: "El proveedor tardó demasiado en responder.",
  ai_unavailable: "El análisis de IA no está disponible.",
  ai_invalid_response: "La IA devolvió una respuesta inválida.",
  network_error: "No se pudo conectar con el servidor de TraderPulse.",
  invalid_response: "El servidor devolvió una respuesta inesperada.",
};

const GENERIC_MESSAGE = "Ocurrió un error inesperado.";

export function fallbackMessage(code: string): string {
  return FALLBACK_MESSAGES[code] ?? GENERIC_MESSAGE;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return GENERIC_MESSAGE;
}
