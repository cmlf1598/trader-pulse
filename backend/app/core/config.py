from functools import lru_cache
from typing import Literal, Self

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

type Environment = Literal["development", "production"]

DEV_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")
_DEFAULT_PORTS = {"http": 80, "https": 443}


class Settings(BaseSettings):
    """Process configuration, validated once at startup so a misconfigured deploy never serves."""

    # pydantic-settings reads `.env` through python-dotenv; real env vars take precedence.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: SecretStr
    gemini_model: str = Field(default="gemini-3-flash-preview", min_length=1)
    environment: Environment = "development"
    frontend_url: AnyHttpUrl
    port: int = Field(default=8080, ge=1, le=65535)
    sentiment_cache_ttl_seconds: int = Field(default=600, ge=0)
    upstream_timeout_seconds: float = Field(default=15, gt=0, le=120)

    @field_validator("gemini_api_key")
    @classmethod
    def _reject_blank_api_key(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("GEMINI_API_KEY must not be empty")
        return value

    @model_validator(mode="after")
    def _require_https_in_production(self) -> Self:
        if self.is_production and self.frontend_url.scheme != "https":
            raise ValueError("FRONTEND_URL must use https when ENVIRONMENT=production")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def frontend_origin(self) -> str:
        # Browsers send a bare origin and CORS compares it as an exact string.
        url = self.frontend_url
        port = "" if url.port in (None, _DEFAULT_PORTS[url.scheme]) else f":{url.port}"
        return f"{url.scheme}://{url.host}{port}"

    @property
    def cors_origins(self) -> list[str]:
        if self.is_production:
            return [self.frontend_origin]
        return list(dict.fromkeys([self.frontend_origin, *DEV_ORIGINS]))


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # required fields come from the environment
