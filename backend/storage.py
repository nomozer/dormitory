from __future__ import annotations

import csv
import threading
from dataclasses import dataclass
from typing import Any

from config import DATA_DIR


@dataclass(frozen=True)
class DatasetSpec:
    name: str
    file_name: str
    description: str


DATASET_SPECS = {
    "students": DatasetSpec("students", "students.csv", "Danh sách sinh viên"),
    "rooms": DatasetSpec("rooms", "rooms.csv", "Danh sách phòng ở"),
    "contracts": DatasetSpec("contracts", "contracts.csv", "Hợp đồng ký túc xá"),
    "fees": DatasetSpec("fees", "fees.csv", "Hóa đơn và thanh toán"),
    "violations": DatasetSpec("violations", "violations.csv", "Vi phạm nội quy"),
    "maintenance_requests": DatasetSpec(
        "maintenance_requests",
        "maintenance_requests.csv",
        "Yêu cầu bảo trì",
    ),
    "attendance_logs": DatasetSpec(
        "attendance_logs",
        "attendance_logs.csv",
        "Nhật ký điểm danh / giờ giới nghiêm",
    ),
}

MAX_CELL_CHARS = 4096
_FILE_LOCK = threading.Lock()


def _resolve_dataset(name: str) -> DatasetSpec:
    key = (name or "").strip().lower()
    if key not in DATASET_SPECS:
        raise KeyError(f"Unknown dataset: {name}")
    return DATASET_SPECS[key]


def dataset_path(name: str) -> Path:
    spec = _resolve_dataset(name)
    return DATA_DIR / spec.file_name


def read_rows(name: str, limit: int | None = None) -> list[dict[str, str]]:
    path = dataset_path(name)
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows: list[dict[str, str]] = []
        for idx, row in enumerate(reader):
            rows.append({k: (v or "") for k, v in row.items()})
            if limit is not None and idx + 1 >= limit:
                break
        return rows


def row_count(name: str) -> int:
    path = dataset_path(name)
    if not path.exists():
        return 0

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        # Remove header
        _ = next(reader, None)
        return sum(1 for _ in reader)


def append_row(name: str, row: dict[str, Any]) -> dict[str, Any]:
    path = dataset_path(name)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []

    if not headers:
        raise ValueError(f"Dataset has no header: {path.name}")

    normalized = {}
    for h in headers:
        value = str(row.get(h, "")).replace("\x00", "").strip()
        if len(value) > MAX_CELL_CHARS:
            raise ValueError(f"Field '{h}' is too long (>{MAX_CELL_CHARS} chars)")
        normalized[h] = value

    if all(normalized[h] == "" for h in headers):
        raise ValueError("Empty row is not allowed")

    # Lock writes to prevent concurrent append corruption.
    with _FILE_LOCK:
        with path.open("a", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writerow(normalized)

    return normalized


def list_datasets() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for spec in DATASET_SPECS.values():
        path = DATA_DIR / spec.file_name
        items.append(
            {
                "name": spec.name,
                "description": spec.description,
                "file": spec.file_name,
                "exists": path.exists(),
                "rows": row_count(spec.name) if path.exists() else 0,
            }
        )
    return items
