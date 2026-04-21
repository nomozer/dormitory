def test_analytics_overview(client):
    response = client.get("/api/analytics/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "metrics" in data
    
    metrics = data["metrics"]
    assert "occupancy_rate" in metrics
    assert "total_occupied" in metrics
    assert "total_capacity" in metrics
    assert "occupancy_risk_score" in metrics
