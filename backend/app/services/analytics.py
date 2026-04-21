from __future__ import annotations

import datetime as dt
from typing import Any
import sqlite3

from services.storage import get_db_connection

PAID_FEE_STATUSES = ("Đã thanh toán", "Đã thu")
PENDING_MAINTENANCE_STATUSES = ("Mới", "Đang xử lý", "Open", "In Progress")
ONTIME_STATUSES = ("ontime", "on_time", "đúng giờ")


def compute_overview(prefer_cpp: bool = False) -> dict[str, Any]:
    """
    Computes dashboard metrics using SQL for maximum efficiency.
    """
    try:
        metrics = _compute_sql_metrics()
        return {
            "ok": True,
            "engine": "sql",
            "metrics": metrics,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e)
        }


def _compute_sql_metrics() -> dict[str, Any]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Room Metrics
        cursor.execute("""
            SELECT 
                COUNT(*) as total_rooms,
                SUM(CAST(capacity AS INTEGER)) as total_capacity,
                SUM(CAST(occupied AS INTEGER)) as total_occupied,
                SUM(CASE WHEN status = 'Đang bảo trì' THEN 1 ELSE 0 END) as maintenance_rooms,
                SUM(CASE WHEN status != 'Đang bảo trì' AND CAST(occupied AS INTEGER) < CAST(capacity AS INTEGER) THEN 1 ELSE 0 END) as available_rooms,
                SUM(CASE WHEN CAST(occupied AS INTEGER) > CAST(capacity AS INTEGER) AND CAST(capacity AS INTEGER) > 0 THEN 1 ELSE 0 END) as overcrowded_rooms
            FROM rooms
        """)
        room_data = dict(cursor.fetchone())

        # 2. Student Count
        cursor.execute("SELECT COUNT(*) FROM students")
        total_students = cursor.fetchone()[0]

        # 3. Fee Metrics
        # Construct dynamic list for IN clause
        placeholders = ', '.join(['?'] * len(PAID_FEE_STATUSES))
        cursor.execute(f"""
            SELECT 
                SUM(CASE WHEN status IN ({placeholders}) THEN CAST(amount AS INTEGER) ELSE 0 END) as total_revenue,
                SUM(CASE WHEN status NOT IN ({placeholders}) THEN CAST(amount AS INTEGER) ELSE 0 END) as total_unpaid,
                SUM(CASE WHEN status NOT IN ({placeholders}) THEN 1 ELSE 0 END) as unpaid_invoice_count
            FROM fees
        """, PAID_FEE_STATUSES * 3)
        fee_data = dict(cursor.fetchone())

        # 4. Violation Metrics
        cursor.execute("SELECT COUNT(*) FROM violations WHERE status != 'Đã giải quyết'")
        unresolved_violations = cursor.fetchone()[0]

        # 5. Contract Metrics
        # We need current date for expiring check
        today = dt.date.today().isoformat()
        thirty_days_later = (dt.date.today() + dt.timedelta(days=30)).isoformat()
        
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN status = 'Hiệu lực' THEN 1 ELSE 0 END) as active_contracts,
                SUM(CASE 
                    WHEN status = 'Sắp hết hạn' OR (status = 'Hiệu lực' AND endDate >= ? AND endDate <= ?) THEN 1 
                    ELSE 0 
                END) as expiring_contracts
            FROM contracts
        """, (today, thirty_days_later))
        contract_data = dict(cursor.fetchone())

        # 6. Maintenance Metrics
        m_placeholders = ', '.join(['?'] * len(PENDING_MAINTENANCE_STATUSES))
        cursor.execute(f"SELECT COUNT(*) FROM maintenance_requests WHERE status IN ({m_placeholders})", PENDING_MAINTENANCE_STATUSES)
        pending_maintenance = cursor.fetchone()[0]

        # 7. Attendance Metrics (Last 7 days)
        seven_days_ago = (dt.date.today() - dt.timedelta(days=7)).isoformat()
        at_placeholders = ', '.join(['?'] * len(ONTIME_STATUSES))
        
        cursor.execute(f"""
            SELECT 
                COUNT(*) as attendance_events_7d,
                SUM(CASE WHEN LOWER(TRIM(status)) IN ({at_placeholders}) THEN 1 ELSE 0 END) as attendance_ontime_7d
            FROM attendance_logs
            WHERE SUBSTR(eventTime, 1, 10) >= ?
        """, ONTIME_STATUSES + (seven_days_ago,))
        attendance_data = dict(cursor.fetchone())

    # Post-processing
    total_capacity = room_data['total_capacity'] or 0
    total_occupied = room_data['total_occupied'] or 0
    occupancy_rate = (total_occupied / total_capacity * 100) if total_capacity > 0 else 0
    
    att_total = attendance_data['attendance_events_7d'] or 0
    att_ontime = attendance_data['attendance_ontime_7d'] or 0
    att_rate = (att_ontime / att_total * 100) if att_total > 0 else 100.0

    # Risk Score calculation (same logic as C++)
    unpaid_count = fee_data['unpaid_invoice_count'] or 0
    occupancy_risk_score = int(round(min(100.0, 
        occupancy_rate * 0.55 + 
        unresolved_violations * 1.8 + 
        pending_maintenance * 2.5 + 
        unpaid_count * 0.8
    )))

    return {
        "engine": "sqlite-sql",
        "total_students": total_students,
        **room_data,
        "occupancy_rate": round(occupancy_rate, 2),
        **fee_data,
        "unresolved_violations": unresolved_violations,
        **contract_data,
        "pending_maintenance": pending_maintenance,
        **attendance_data,
        "attendance_on_time_rate_7d": round(att_rate, 2),
        "occupancy_risk_score": occupancy_risk_score,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds")
    }
