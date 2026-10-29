import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types

from app import __version__
from app.api.root import router as root_router
from app.api.v1 import router as v1_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.services.ai_service import AIService
from app.services.gamification_service import GamificationService
from app.services.market_service import MarketService

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    logger.info(
        "TraderPulse API v%s starting (environment=%s, model=%s, cors_origins=%s)",
        __version__,
        settings.environment,
        settings.gemini_model,
        settings.cors_origins,
    )
    yield
    client = getattr(app.state, "genai_client", None)
    if client is not None:
        await client.aio.aclose()


def build_genai_client(settings: Settings) -> genai.Client:
    return genai.Client(
        api_key=settings.gemini_api_key.get_secret_value(),
        http_options=types.HttpOptions(timeout=int(settings.upstream_timeout_seconds * 1000)),
    )


def create_app(
    settings: Settings | None = None,
    *,
    market_service: MarketService | None = None,
    ai_service: AIService | None = None,
    gamification_service: GamificationService | None = None,
) -> FastAPI:
    """App factory. Services can be injected (tests); otherwise real ones are built."""
    settings = settings or get_settings()
    docs_enabled = not settings.is_production

    app = FastAPI(
        title="TraderPulse API",
        version=__version__,
        summary="Real-time market data (Yahoo Finance) and AI sentiment (Gemini).",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    market_service = market_service or MarketService(
        timeout_seconds=settings.upstream_timeout_seconds
    )
    if ai_service is None:
        app.state.genai_client = build_genai_client(settings)
        ai_service = AIService(
            client=app.state.genai_client,
            model=settings.gemini_model,
            market=market_service,
            cache_ttl_seconds=settings.sentiment_cache_ttl_seconds,
            timeout_seconds=settings.upstream_timeout_seconds,
        )

    app.state.settings = settings
    app.state.market_service = market_service
    app.state.ai_service = ai_service
    app.state.gamification_service = gamification_service or GamificationService()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
        expose_headers=["Retry-After"],
        allow_credentials=False,
        max_age=600,
    )
    register_exception_handlers(app)
    app.include_router(root_router)
    app.include_router(v1_router)
    return app
