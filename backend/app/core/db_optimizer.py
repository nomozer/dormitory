import sqlite3
import os
from pathlib import Path

def optimize_database(db_path: str):
    print(f"Optimizing database at {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Performance PRAGMAs
        print("- Applying performance PRAGMAs")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA cache_size = -64000") # 64MB cache
        conn.execute("PRAGMA temp_store = MEMORY")
        
        # 2. Add Strategic Indexes
        print("- Creating strategic indexes")
        
        # Students
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_students_room ON students(room)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_students_status ON students(status)")
        
        # Rooms
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rooms_building_floor ON rooms(building, floor)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status)")
        
        # Contracts
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_contracts_studentId ON contracts(studentId)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_contracts_room ON contracts(room)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)")
        
        # Fees (Very common for analytics)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fees_month_status ON fees(month, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fees_room ON fees(room)")
        
        # Violations
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_violations_studentId ON violations(studentId)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_violations_date ON violations(date)")
        
        # Attendance Logs
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_student_time ON attendance_logs(studentId, eventTime)")
        
        # Maintenance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_maintenance_room_status ON maintenance_requests(room, status)")

        # 3. Optimize Space
        print("- Running ANALYZE and VACUUM")
        conn.execute("ANALYZE")
        conn.execute("VACUUM")
        
        conn.commit()
        print("Done. Database optimized.")
        
    except Exception as e:
        print(f"Error during optimization: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    # Get database path from relative structure
    base_dir = Path(__file__).resolve().parents[2]
    db_file = base_dir / "data" / "dormitory.db"
    if db_file.exists():
        optimize_database(str(db_file))
    else:
        print(f"Database not found at {db_file}")
