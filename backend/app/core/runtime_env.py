from __future__ import annotations

import os
import shutil
import tempfile
import time
from pathlib import Path

from core.config import ROOT_DIR, RUNTIME_DIR, RUNTIME_LOG_DIR, RUNTIME_TMP_DIR


def ensure_runtime_dirs() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_TMP_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_LOG_DIR.mkdir(parents=True, exist_ok=True)


def configure_temp_env() -> None:
    ensure_runtime_dirs()
    tmp_path = str(RUNTIME_TMP_DIR)
    os.environ["TMP"] = tmp_path
    os.environ["TEMP"] = tmp_path
    os.environ["TMPDIR"] = tmp_path
    tempfile.tempdir = tmp_path


def quarantine_legacy_temp_dirs() -> list[str]:
    moved: list[str] = []
    candidates = [ROOT_DIR / ".tmp_py", ROOT_DIR / ".tmp_pip"]

    for candidate in candidates:
        if not candidate.exists():
            continue

        ts = int(time.time())
        quarantine_name = f"{candidate.name}_quarantine_{ts}"
        quarantine_path = ROOT_DIR / quarantine_name

        try:
            candidate.rename(quarantine_path)
            moved.append(quarantine_name)
        except Exception:
            # Keep running even if path cannot be moved.
            continue

    return moved


def cleanup_runtime_tmp(max_age_hours: int = 24) -> dict[str, int]:
    ensure_runtime_dirs()
    now = time.time()
    ttl_seconds = max_age_hours * 3600
    removed_files = 0
    removed_dirs = 0
    skipped = 0

    for item in RUNTIME_TMP_DIR.iterdir():
        if item.name == ".gitkeep":
            continue
        try:
            item_age = now - item.stat().st_mtime
            if item_age < ttl_seconds:
                continue

            if item.is_dir():
                shutil.rmtree(item, ignore_errors=False)
                removed_dirs += 1
            else:
                item.unlink(missing_ok=True)
                removed_files += 1
        except Exception:
            skipped += 1

    return {
        "removed_files": removed_files,
        "removed_dirs": removed_dirs,
        "skipped": skipped,
    }
