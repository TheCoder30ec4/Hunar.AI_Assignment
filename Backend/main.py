from fastapi import FastAPI

from controllers.auth_controller import router as auth_router
from Database.core import lifespan_db

app = FastAPI(title="Hunar recruiter console API", lifespan=lifespan_db)

app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
