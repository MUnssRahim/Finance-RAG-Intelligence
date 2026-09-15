from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings

from .api.routes import router

app = FastAPI(title=settings.app_name, version=settings.api_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods.split(","),
    allow_headers=settings.cors_allow_headers.split(","),
)

app.include_router(router, prefix=settings.api_prefix)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}