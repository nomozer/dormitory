from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from core.config import ALLOWED_ORIGINS, ALLOW_LOCAL_DEV_ORIGIN_PREFIXES, LOCAL_DEV_ORIGIN_PREFIXES, HOST, PORT, ALLOW_NON_LOCALHOST
from core.runtime_env import configure_temp_env, quarantine_legacy_temp_dirs, cleanup_runtime_tmp

from api.health import router as health_router
from api.analytics import router as analytics_router
from api.datasets import router as datasets_router

def create_app() -> FastAPI:
    app = FastAPI(title="Dormitory Backend API")

    # Add dynamic CORS middleware if needed, but FastAPI CORSMiddleware supports regex or list
    allowed_origins = list(ALLOWED_ORIGINS)
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if allowed_origins and "null" not in allowed_origins else ["*"],
        allow_origin_regex=r"^http://(127\.0\.0\.1|localhost)(:\d+)?$" if ALLOW_LOCAL_DEV_ORIGIN_PREFIXES else None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router, prefix="/api")
    app.include_router(analytics_router, prefix="/api")
    app.include_router(datasets_router, prefix="/api")

    return app

app = create_app()

def run_server() -> None:
    configure_temp_env()
    quarantined = quarantine_legacy_temp_dirs()
    cleanup = cleanup_runtime_tmp(max_age_hours=24)

    bind_host = HOST if ALLOW_NON_LOCALHOST else "127.0.0.1"
    
    print(f"Dorm backend running at http://{bind_host}:{PORT}")
    if quarantined:
        print(f"Quarantined legacy temp dirs: {', '.join(quarantined)}")
    print(
        "Runtime cleanup: "
        f"removed_files={cleanup['removed_files']} "
        f"removed_dirs={cleanup['removed_dirs']} "
        f"skipped={cleanup['skipped']}"
    )

    uvicorn.run("main:app", host=bind_host, port=PORT, reload=False)

if __name__ == "__main__":
    run_server()
