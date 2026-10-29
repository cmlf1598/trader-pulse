from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    """Documents the error envelope in OpenAPI; produced by `app.core.errors`."""

    error: ErrorDetail
