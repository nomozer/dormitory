from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from core.config import DATA_DIR

DB_PATH = DATA_DIR / "dormitory.db"
_DB_LOCK = threading.Lock()

@dataclass(frozen=True)
class DatasetSpec:
    name: str
    description: str

DATASET_SPECS = {
    "students": DatasetSpec("students", "Danh sách sinh viên"),
    "rooms": DatasetSpec("rooms", "Danh sách phòng ở"),
    "contracts": DatasetSpec("contracts", "Hợp đồng ký túc xá"),
    "fees": DatasetSpec("fees", "Hóa đơn và thanh toán"),
    "violations": DatasetSpec("violations", "Vi phạm nội quy"),
    "maintenance_requests": DatasetSpec(
        "maintenance_requests",
        "Yêu cầu bảo trì",
    ),
    "attendance_logs": DatasetSpec(
        "attendance_logs",
        "Nhật ký điểm danh / giờ giới nghiêm",
    ),
}

MAX_CELL_CHARS = 4096


def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA cache_size = -32000") # 32MB cache
    conn.row_factory = sqlite3.Row
    return conn


def _resolve_dataset(name: str) -> DatasetSpec:
    key = (name or "").strip().lower()
    if key not in DATASET_SPECS:
        raise KeyError(f"Unknown dataset: {name}")
    return DATASET_SPECS[key]


def read_rows(name: str, limit: int | None = None) -> list[dict[str, str]]:
    spec = _resolve_dataset(name)
    if not DB_PATH.exists():
        return []

    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = f"SELECT * FROM {spec.name}"
        if limit is not None:
            query += f" LIMIT {limit}"
        cursor.execute(query)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def row_count(name: str) -> int:
    spec = _resolve_dataset(name)
    if not DB_PATH.exists():
        return 0

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {spec.name}")
        row = cursor.fetchone()
        return row[0] if row else 0


def append_row(name: str, row: dict[str, Any]) -> dict[str, Any]:
    spec = _resolve_dataset(name)
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    with _DB_LOCK:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Fetch table schema
            cursor.execute(f"PRAGMA table_info({spec.name})")
            columns_info = cursor.fetchall()
            if not columns_info:
                raise ValueError(f"Table {spec.name} has no schema defined.")
                
            headers = [col["name"] for col in columns_info]

            normalized = {}
            for h in headers:
                value = str(row.get(h, "")).replace("\x00", "").strip()
                if len(value) > MAX_CELL_CHARS:
                    raise ValueError(f"Field '{h}' is too long (>{MAX_CELL_CHARS} chars)")
                normalized[h] = value

            if all(normalized[h] == "" for h in headers):
                raise ValueError("Empty row is not allowed")

            placeholders = ", ".join(["?" for _ in headers])
            insert_stmt = f"INSERT INTO {spec.name} ({', '.join([f'\"{h}\"' for h in headers])}) VALUES ({placeholders})"
            cursor.execute(insert_stmt, tuple(normalized[h] for h in headers))
            conn.commit()

    return normalized




def list_datasets() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    
    db_exists = DB_PATH.exists()
    
    for spec in DATASET_SPECS.values():
        items.append(
            {
                "name": spec.name,
                "description": spec.description,
                "file": f"{spec.name} (SQLite)",
                "exists": db_exists,
                "rows": row_count(spec.name) if db_exists else 0,
            }
        )
    return items
