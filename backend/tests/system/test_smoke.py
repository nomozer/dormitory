import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
RUNTIME_TMP = BACKEND_DIR / "runtime" / "tmp"

def http_get(url: str, timeout: float = 2.0) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)

def wait_until_ready(url: str, retries: int = 40, delay: float = 0.2) -> None:
    last_error = None
    for _ in range(retries):
        try:
            payload = http_get(url, timeout=1.5)
            if payload.get("ok") is True:
                return
        except Exception as exc:
            last_error = exc
        time.sleep(delay)
    raise RuntimeError(f"Backend health check failed: {last_error}")

def list_root_tmp_dirs() -> set[str]:
    return {p.name for p in ROOT_DIR.iterdir() if p.is_dir() and p.name.startswith(".tmp")}

@pytest.mark.system
def test_smoke_startup_and_endpoints():
    """Verify that the backend actually starts up as a real process and responds."""
    python_exe = sys.executable
    env = os.environ.copy()
    env["DORM_BACKEND_HOST"] = "127.0.0.1"
    env["DORM_BACKEND_PORT"] = "5055" # Use a different port for smoke test to avoid conflicts
    env["TMP"] = str(RUNTIME_TMP)
    env["TEMP"] = str(RUNTIME_TMP)
    
    before_tmp = list_root_tmp_dirs()
    
    # Start the process
    main_script = BACKEND_DIR / "app" / "main.py"
    proc = subprocess.Popen([python_exe, str(main_script)], cwd=str(ROOT_DIR), env=env)
    
    try:
        # Wait for boot
        wait_until_ready("http://127.0.0.1:5055/api/health")
        
        # Check basic endpoints
        health = http_get("http://127.0.0.1:5055/api/health")
        overview = http_get("http://127.0.0.1:5055/api/analytics/overview")

        assert health.get("ok") is True
        assert overview.get("ok") is True
        assert overview.get("engine") == "sql"
        assert "metrics" in overview
        
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    # Verify no clutter left behind at root
    after_tmp = list_root_tmp_dirs()
    new_tmp = after_tmp - before_tmp
    assert not new_tmp, f"Unexpected new temp folders at root: {new_tmp}"
