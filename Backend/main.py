import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from controllers.auth_controller import router as auth_router
from controllers.campaign_controller import router as campaign_router
from controllers.search_controller import router as search_router
from controllers.settings_controller import router as settings_router
from controllers.webhook_controller import router as webhook_router
from Database.core import lifespan_db

# Every module does logging.getLogger(__name__) but nothing ever configured
# the root logger, so under uvicorn those records went nowhere. One
# basicConfig here wires all of them to stdout, which is what Render tails.
# ponytail: stdlib basicConfig, swap for dictConfig if JSON logs are needed.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    force=True,
)

app = FastAPI(title="Hunar recruiter console API", lifespan=lifespan_db)

# The frontend is a different origin from this API (Vite's dev server on
# :5173 locally; whatever host serves the built app in production), so the
# browser blocks every request without CORS. Hardcoding localhost would make
# a deployed frontend fail with an opaque CORS error, hence the env override:
#   CORS_ORIGINS=https://app.example.com,https://staging.example.com
_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in _origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(search_router)
app.include_router(campaign_router)
app.include_router(settings_router)
app.include_router(webhook_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
