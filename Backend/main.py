from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from controllers.auth_controller import router as auth_router
from Database.core import lifespan_db

app = FastAPI(title="Hunar recruiter console API", lifespan=lifespan_db)

# Frontend runs on Vite's dev server (localhost:5173) while this API runs on
# :8000 — different origins, so the browser blocks the request without CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
