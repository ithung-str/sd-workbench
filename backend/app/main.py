from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def _load_repo_env() -> None:
    # backend/app/main.py -> repo root is parents[2]
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_repo_env()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from app.api.routes_ai import router as ai_router
from app.api.routes_analysis import router as analysis_router
from app.api.routes_data import router as data_router
from app.api.routes_imports import router as imports_router
from app.api.routes_models import router as models_router
from app.api.routes_notebook import router as notebook_router
from app.db import init_db

init_db()

app = FastAPI(title="SD Model Builder Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models_router)
app.include_router(ai_router)
app.include_router(imports_router)
app.include_router(analysis_router)
app.include_router(data_router)
app.include_router(notebook_router)
