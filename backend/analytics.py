from __future__ import annotations

import datetime as dt
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from config import DATA_DIR, RUNTIME_TMP_DIR
from storage import read_rows

CPP_ENGINE = Path(__file__).resolve().parent / "bin" / "analytics_engine.exe"
PAID_FEE_STATUSES = {"Đã thanh toán", "Đã thu"}
PENDING_MAINTENANCE_STATUSES = {"Mới", "Đang xử lý", "Open", "In Progress"}
ONTIME_STATUSES = {"ontime", "on_time", "đúng giờ"}
NUMBER_RE = re.compile(r"^[+-]?\d+(\.\d+)?$")


def is_cpp_available() -> bool:
    return CPP_ENGINE.exists()


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(float(str(value).strip()))
    except Exception:
        return default


def _days_until(iso_date: str) -> int:
    try:
        target = dt.date.fromisoformat(str(iso_date)[:10])
        return (target - dt.date.today()).days
    except Exception:
        return 10**9


def _days_ago(iso_or_datetime: str) -> int:
    try:
        value = dt.date.fromisoformat(str(iso_or_datetime)[:10])
        return (dt.date.today() - value).days
    except Exception:
        return 10**9


def _compute_python_metrics() -> dict[str, Any]:
    rooms = read_rows("rooms")
    students = read_rows("students")
    contracts = read_rows("contracts")
    fees = read_rows("fees")
    violations = read_rows("violations")
    maintenance = read_rows("maintenance_requests")
    attendance = read_rows("attendance_logs")

    total_capacity = sum(_to_int(r.get("capacity")) for r in rooms)
    total_occupied = sum(_to_int(r.get("occupied")) for r in rooms)
    total_rooms = len(rooms)
    available_rooms = sum(
        1
        for r in rooms
        if (r.get("status") != "Đang bảo trì") and (_to_int(r.get("occupied")) < _to_int(r.get("capacity")))
    )
    maintenance_rooms = sum(1 for r in rooms if r.get("status") == "Đang bảo trì")
    overcrowded_rooms = sum(
        1 for r in rooms if _to_int(r.get("occupied")) > _to_int(r.get("capacity")) > 0
    )

    paid_fees = [f for f in fees if f.get("status") in PAID_FEE_STATUSES]
    unpaid_fees = [f for f in fees if f.get("status") not in PAID_FEE_STATUSES]
    total_revenue = sum(_to_int(f.get("amount")) for f in paid_fees)
    total_unpaid = sum(_to_int(f.get("amount")) for f in unpaid_fees)

    unresolved_violations = sum(1 for v in violations if v.get("status") != "Đã giải quyết")
    active_contracts = sum(1 for c in contracts if c.get("status") == "Hiệu lực")
    expiring_contracts = sum(
        1
        for c in contracts
        if c.get("status") == "Sắp hết hạn"
        or (c.get("status") == "Hiệu lực" and 0 <= _days_until(c.get("endDate", "")) <= 30)
    )
    pending_maintenance = sum(
        1 for m in maintenance if (m.get("status") or "").strip() in PENDING_MAINTENANCE_STATUSES
    )

    attendance_recent = [a for a in attendance if 0 <= _days_ago(a.get("eventTime", "")) <= 6]
    attendance_ontime = sum(
        1 for a in attendance_recent if (a.get("status", "").strip().lower() in ONTIME_STATUSES)
    )
    attendance_rate = (
        (attendance_ontime / len(attendance_recent)) * 100 if attendance_recent else 100.0
    )

    occupancy_rate = (total_occupied / total_capacity) * 100 if total_capacity else 0.0
    occupancy_risk_score = int(
        round(
            min(
                100.0,
                occupancy_rate * 0.55
                + unresolved_violations * 1.8
                + pending_maintenance * 2.5
                + len(unpaid_fees) * 0.8,
            )
        )
    )

    return {
        "engine": "python",
        "total_students": len(students),
        "total_rooms": total_rooms,
        "available_rooms": available_rooms,
        "maintenance_rooms": maintenance_rooms,
        "overcrowded_rooms": overcrowded_rooms,
        "total_capacity": total_capacity,
        "total_occupied": total_occupied,
        "occupancy_rate": round(occupancy_rate, 2),
        "total_revenue": total_revenue,
        "total_unpaid": total_unpaid,
        "unpaid_invoice_count": len(unpaid_fees),
        "unresolved_violations": unresolved_violations,
        "active_contracts": active_contracts,
        "expiring_contracts": expiring_contracts,
        "pending_maintenance": pending_maintenance,
        "attendance_events_7d": len(attendance_recent),
        "attendance_ontime_7d": attendance_ontime,
        "attendance_on_time_rate_7d": round(attendance_rate, 2),
        "occupancy_risk_score": occupancy_risk_score,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
    }


def _parse_cpp_output(stdout: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value == "":
            result[key] = value
            continue

        if NUMBER_RE.match(value):
            if "." in value:
                result[key] = float(value)
            else:
                result[key] = int(value)
            continue

        result[key] = value
    return result


def _compute_cpp_metrics() -> dict[str, Any]:
    args = [
        str(CPP_ENGINE),
        str(DATA_DIR / "rooms.csv"),
        str(DATA_DIR / "students.csv"),
        str(DATA_DIR / "fees.csv"),
        str(DATA_DIR / "violations.csv"),
        str(DATA_DIR / "contracts.csv"),
        str(DATA_DIR / "maintenance_requests.csv"),
        str(DATA_DIR / "attendance_logs.csv"),
    ]
    temp_env = os.environ.copy()
    temp_env["TMP"] = str(RUNTIME_TMP_DIR)
    temp_env["TEMP"] = str(RUNTIME_TMP_DIR)
    temp_env["TMPDIR"] = str(RUNTIME_TMP_DIR)

    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=temp_env,
        timeout=3.0,
        check=True,
    )
    metrics = _parse_cpp_output(proc.stdout)
    metrics["generated_at"] = dt.datetime.now().isoformat(timespec="seconds")
    return metrics


def compute_overview(prefer_cpp: bool = True) -> dict[str, Any]:
    error = None
    metrics: dict[str, Any]

    if prefer_cpp and is_cpp_available():
        try:
            metrics = _compute_cpp_metrics()
            source = "cpp"
        except Exception as exc:
            error = str(exc)
            metrics = _compute_python_metrics()
            source = "python"
    else:
        metrics = _compute_python_metrics()
        source = "python"

    return {
        "ok": True,
        "engine": source,
        "cpp_available": is_cpp_available(),
        "fallback_reason": error,
        "metrics": metrics,
    }
