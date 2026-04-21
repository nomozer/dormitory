from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"

# Load environment variables from .env file
load_dotenv(BACKEND_DIR / ".env")

FRONTEND_DIR = ROOT_DIR / "frontend"
DATA_DIR = BACKEND_DIR / "data"
RUNTIME_DIR = BACKEND_DIR / "runtime"
RUNTIME_TMP_DIR = RUNTIME_DIR / "tmp"
RUNTIME_LOG_DIR = RUNTIME_DIR / "logs"

HOST = os.getenv("DORM_BACKEND_HOST", "127.0.0.1")
PORT = int(os.getenv("DORM_BACKEND_PORT", "5050"))

# If this is empty, write endpoints are open in local network context.
API_KEY = os.getenv("DORM_BACKEND_API_KEY", "").strip()

MAX_JSON_BODY_BYTES = int(os.getenv("DORM_BACKEND_MAX_BODY_BYTES", str(128 * 1024)))
DEFAULT_DATASET_LIMIT = int(os.getenv("DORM_BACKEND_DEFAULT_LIMIT", "200"))
MAX_DATASET_LIMIT = int(os.getenv("DORM_BACKEND_MAX_LIMIT", "2000"))

# Comma-separated list, e.g. "http://127.0.0.1:4173,http://localhost:4173"
ALLOWED_ORIGINS_RAW = os.getenv(
    "DORM_BACKEND_ALLOWED_ORIGINS",
    "http://127.0.0.1:4173,http://localhost:4173,null",
)
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in ALLOWED_ORIGINS_RAW.split(",")
    if origin.strip()
}

# Allow local dev tools (Live Server, Vite, etc.) on any localhost port.
ALLOW_LOCAL_DEV_ORIGIN_PREFIXES = (
    os.getenv("DORM_BACKEND_ALLOW_LOCAL_DEV_ORIGIN_PREFIXES", "1").strip() == "1"
)
LOCAL_DEV_ORIGIN_PREFIXES_RAW = os.getenv(
    "DORM_BACKEND_LOCAL_DEV_ORIGIN_PREFIXES",
    "http://127.0.0.1:,http://localhost:,https://127.0.0.1:,https://localhost:",
)
LOCAL_DEV_ORIGIN_PREFIXES = tuple(
    prefix.strip()
    for prefix in LOCAL_DEV_ORIGIN_PREFIXES_RAW.split(",")
    if prefix.strip()
)

# Enable this in trusted local network when needed:
# 0 => bind localhost only; 1 => allow custom HOST
ALLOW_NON_LOCALHOST = os.getenv("DORM_BACKEND_ALLOW_NON_LOCALHOST", "0").strip() == "1"
