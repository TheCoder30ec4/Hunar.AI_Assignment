# syntax=docker/dockerfile:1
#
# Multi-stage: dependencies are resolved once in the builder and copied into
# a clean runtime image, so the final image carries no build toolchain.

FROM python:3.12-slim AS builder

# uv is the project's package manager (uv.lock is the source of truth).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Install dependencies as their own layer, keyed on the lockfile alone, so
# editing application code doesn't reinstall the whole dependency tree.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


FROM python:3.12-slim AS runtime

# curl is needed by the container healthcheck below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user: a container breakout should not land on root.
RUN useradd --create-home --uid 10001 app

WORKDIR /app

COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# ONE worker, deliberately. Calling runs are tracked in an in-process dict
# (services/calling_jobs.py), so a second worker would not see a campaign
# started by the first — a run would appear to vanish. Moving that state to
# Postgres or Redis is what unlocks scaling; until then this stays at 1.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
