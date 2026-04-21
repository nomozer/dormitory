import pytest
import sys
import os
from pathlib import Path

# Add backend/app to Python path
sys.path.insert(0, str(Path(__file__).parent.parent / "app"))

from fastapi.testclient import TestClient

from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c
