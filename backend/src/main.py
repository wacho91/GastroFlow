import os
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, init_db
from . import models  # <-- Importa modelos para registrar tablas en SQLAlchemy
from .routes import router

# ------------------------------------------------------------------
# Logging configuration
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Lifespan handler (startup / shutdown)  - FastAPI >= 1.0 style
# ------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Maneja el ciclo de vida de la aplicación:
    - startup: inicializa la base de datos (crea tablas si no existen)
    - shutdown: cierra el engine de SQLAlchemy
    """
    logger.info("Starting up...")
    await init_db()
    yield
    logger.info("Shutting down...")
    await engine.dispose()
    logger.info("Engine disposed.")

# ------------------------------------------------------------------
# FastAPI application instance
# ------------------------------------------------------------------
app = FastAPI(
    title="GastroFlow API",
    description="API para gestión gastronómica con facturación electrónica DIAN",
    version="1.0.0",
    lifespan=lifespan,
)

# ------------------------------------------------------------------
# CORS configuration
# ------------------------------------------------------------------
# Permitir el origen del frontend (por defecto React/Vite en desarrollo)
# Se puede configurar mediante variable de entorno FRONTEND_URL o varios orígenes.
origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Include routers
# ------------------------------------------------------------------
app.include_router(router, prefix="/api/v1", tags=["GastroFlow API v1"])

# ------------------------------------------------------------------
# Health check endpoint
# ------------------------------------------------------------------
@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}

# ------------------------------------------------------------------
# Root endpoint (optional)
# ------------------------------------------------------------------
@app.get("/", tags=["System"])
async def root():
    return {
        "message": "Bienvenido a GastroFlow API",
        "docs": "/docs",
        "redoc": "/redoc",
    }

# ------------------------------------------------------------------
# (Opcional) Manejador global de excepciones
# ------------------------------------------------------------------
# @app.exception_handler(Exception)
# async def global_exception_handler(request, exc):
#     logger.error(f"Unhandled error: {exc}", exc_info=True)
#     return JSONResponse(
#         status_code=500,
#         content={"detail": "Internal server error. Please try again later."}
#     )
