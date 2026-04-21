import pytest
import sqlite3
from app.services.storage import get_db_connection, DATASET_SPECS

def test_db_connection():
    """Test that we can connect to the database and it has the expected tables."""
    with get_db_connection() as conn:
        assert isinstance(conn, sqlite3.Connection)
        cursor = conn.cursor()
        
        # Check for essential tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        expected_tables = ["students", "rooms", "contracts", "fees", "violations"]
        for table in expected_tables:
            assert table in tables, f"Table {table} missing from database"

def test_dataset_specs():
    """Test that dataset specs are correctly defined."""
    assert "students" in DATASET_SPECS
    assert "rooms" in DATASET_SPECS
    assert DATASET_SPECS["students"].name == "students"
