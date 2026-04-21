from fastapi import APIRouter
from core.config import ALLOWED_ORIGINS, LOCAL_DEV_ORIGIN_PREFIXES, MAX_JSON_BODY_BYTES, API_KEY
from services.storage import list_datasets

router = APIRouter()

@router.get("/health")
def get_health():
    return {
        "ok": True,
        "service": "dorm-backend",
        "engine": "sqlite-sql",
        "datasets": list_datasets(),
        "security": {
            "api_key_required_for_write": bool(API_KEY),
            "allowed_origins": sorted(ALLOWED_ORIGINS),
            "allowed_origin_prefixes": list(LOCAL_DEV_ORIGIN_PREFIXES),
            "max_body_bytes": MAX_JSON_BODY_BYTES,
        },
    }
