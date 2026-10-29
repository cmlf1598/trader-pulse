"""OpenAPI documentation for the error responses each route group can return."""

from typing import Any

from app.schemas.error import ErrorResponse


def _error(description: str) -> dict[str, Any]:
    return {"model": ErrorResponse, "description": description}


MARKET_ERRORS: dict[int | str, dict[str, Any]] = {
    404: _error("`symbol_not_found`: Yahoo Finance has no data for the symbol."),
    422: _error("`invalid_symbol` / `validation_error`: malformed symbol or query."),
    502: _error("`market_unavailable`: Yahoo Finance failed."),
    503: _error("`rate_limited`: upstream rate limit; see `Retry-After`."),
    504: _error("`upstream_timeout`: Yahoo Finance did not answer in time."),
}

SENTIMENT_ERRORS: dict[int | str, dict[str, Any]] = {
    **MARKET_ERRORS,
    502: _error("`market_unavailable`, `ai_unavailable` or `ai_invalid_response`."),
    503: _error("`rate_limited`: Yahoo Finance or Gemini rate limit; see `Retry-After`."),
    504: _error("`upstream_timeout`: Yahoo Finance or Gemini did not answer in time."),
}
