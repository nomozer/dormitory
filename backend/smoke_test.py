from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
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
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        time.sleep(delay)
    raise RuntimeError(f"Backend health check failed: {last_error}")


def list_root_tmp_dirs() -> set[str]:
    return {p.name for p in ROOT_DIR.iterdir() if p.is_dir() and p.name.startswith(".tmp")}


def main() -> int:
    python_exe = sys.executable
    env = os.environ.copy()
    env["DORM_BACKEND_HOST"] = "127.0.0.1"
    env["DORM_BACKEND_PORT"] = "5050"
    env["DORM_BACKEND_ALLOWED_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173,null"
    env["TMP"] = str(RUNTIME_TMP)
    env["TEMP"] = str(RUNTIME_TMP)
    env["TMPDIR"] = str(RUNTIME_TMP)

    before_tmp = list_root_tmp_dirs()
    proc = subprocess.Popen([python_exe, str(BACKEND_DIR / "server.py")], cwd=str(ROOT_DIR), env=env)
    try:
        wait_until_ready("http://127.0.0.1:5050/api/health")
        health = http_get("http://127.0.0.1:5050/api/health")
        overview = http_get("http://127.0.0.1:5050/api/analytics/overview")

        assert health.get("ok") is True
        assert overview.get("ok") is True
        assert overview.get("engine") in {"cpp", "python"}
        assert isinstance(overview.get("metrics"), dict)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()

    after_tmp = list_root_tmp_dirs()
    new_tmp = sorted(after_tmp - before_tmp)
    if new_tmp:
        raise RuntimeError(f"Unexpected new temp folders at root: {new_tmp}")

    print("SMOKE_TEST_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
