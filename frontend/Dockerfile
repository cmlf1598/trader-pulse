# syntax=docker/dockerfile:1.7
#
# DEVELOPMENT ONLY. This image exists solely for the local docker-compose workflow
# (`docker compose up` from the repo root). Production deploys go to Vercel, which builds the
# app itself; do not ship this image.

FROM node:24-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    # Bind mounts on Windows/macOS don't propagate native FS events into the container.
    WATCHPACK_POLLING=true \
    CHOKIDAR_USEPOLLING=true

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Source is bind-mounted by compose; this copy only makes the image runnable on its own.
COPY . .

EXPOSE 3000

# 0.0.0.0 so the dev server is reachable through the published port.
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
