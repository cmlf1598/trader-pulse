# syntax=docker/dockerfile:1.7
#
# Stages:
#   builder  – resolves production dependencies with uv (cached layer)
#   dev      – adds dev deps + hot reload; used by docker-compose (`target: dev`)
#   runtime  – minimal, non-root image for Google Cloud Run (default target)

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.9.25 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY app ./app


# ---- dev: local docker-compose with hot reload ----
FROM builder AS dev

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1

EXPOSE 8080

# app/ is bind-mounted by compose; uvicorn watches it and reloads on change.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080", \
     "--reload", "--reload-dir", "app"]


# ---- runtime: Cloud Run ----
FROM python:3.12-slim AS runtime

RUN groupadd --system app && useradd --system --gid app --no-create-home app

COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

WORKDIR /app
USER app
EXPOSE 8080

# `python -m app` validates settings (GEMINI_API_KEY, FRONTEND_URL, …) and exits 1 if invalid,
# so a misconfigured revision never receives traffic. Cloud Run injects $PORT.
CMD ["python", "-m", "app"]
