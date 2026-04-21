import pytest
from app.services.analytics import compute_overview

def test_compute_overview_structure():
    """Test that compute_overview returns the expected dictionary structure."""
    result = compute_overview()
    assert isinstance(result, dict)
    assert "ok" in result
    if result["ok"]:
        assert "metrics" in result
        assert "engine" in result
        metrics = result["metrics"]
        assert "total_rooms" in metrics
        assert "total_capacity" in metrics
        assert "total_occupied" in metrics
    else:
        assert "error" in result
