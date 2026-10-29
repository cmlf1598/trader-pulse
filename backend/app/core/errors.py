"""Domain errors and the single JSON error envelope the API returns.

Every failure leaves the API as `{"error": {"code": str, "message": str}}`. `code` is a stable,
machine-readable identifier for the frontend; `message` is Spanish copy safe to show in a toast.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code: int = 500
    code: str = "internal_error"
    message: str = "Ocurrió un error inesperado."

    def __init__(self, message: str | None = None, *, headers: dict[str, str] | None = None):
        self.message = message or type(self).message
        self.headers = headers or {}
        super().__init__(self.message)


class InvalidSymbolError(AppError):
    status_code = 422
    code = "invalid_symbol"

    def __init__(self, symbol: str):
        super().__init__(f"El símbolo «{symbol}» no es válido.")


class SymbolNotFoundError(AppError):
    status_code = 404
    code = "symbol_not_found"

    def __init__(self, symbol: str):
        super().__init__(f"No se encontró el símbolo «{symbol}».")


class MarketDataUnavailableError(AppError):
    status_code = 502
    code = "market_unavailable"
    message = "El servicio de datos de mercado no está disponible en este momento."


class UpstreamRateLimitedError(AppError):
    status_code = 503
    code = "rate_limited"
    message = "Se alcanzó el límite de solicitudes del proveedor. Inténtalo de nuevo en un minuto."

    def __init__(self, message: str | None = None, *, retry_after_seconds: int = 60):
        super().__init__(message, headers={"Retry-After": str(retry_after_seconds)})


class UpstreamTimeoutError(AppError):
    status_code = 504
    code = "upstream_timeout"
    message = "El proveedor de datos tardó demasiado en responder."


class AIServiceError(AppError):
    status_code = 502
    code = "ai_unavailable"
    message = "El análisis de IA no está disponible en este momento."


class AIResponseInvalidError(AppError):
    status_code = 502
    code = "ai_invalid_response"
    message = "La IA devolvió una respuesta inválida. Inténtalo de nuevo."


def error_response(
    status_code: int, code: str, message: str, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


_HTTP_CODES = {404: "not_found", 405: "method_not_allowed"}
_HTTP_MESSAGES = {404: "Recurso no encontrado.", 405: "Método no permitido."}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        log = logger.info if exc.status_code < 500 else logger.warning
        log("%s (%s): %s", exc.code, exc.status_code, exc.message)
        return error_response(exc.status_code, exc.code, exc.message, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        logger.info("validation_error: %s", exc.errors())
        return error_response(422, "validation_error", "Parámetros de la solicitud inválidos.")

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return error_response(
            exc.status_code,
            _HTTP_CODES.get(exc.status_code, "http_error"),
            _HTTP_MESSAGES.get(exc.status_code, str(exc.detail)),
            exc.headers,
        )
