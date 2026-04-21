def test_full_system_status(client):
    """A 'system' level test that verifies various parts of the API are consistent."""
    
    # 1. Check health
    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200
    available_datasets = health_resp.json()["datasets"]
    
    # 2. Check each dataset advertised in health
    for ds in available_datasets:
        name = ds["name"]
        ds_resp = client.get(f"/api/datasets/{name}?limit=1")
        assert ds_resp.status_code == 200
        assert ds_resp.json()["ok"] is True

    
    # 3. Check analytics
    analytics_resp = client.get("/api/analytics/overview")
    assert analytics_resp.status_code == 200
    assert analytics_resp.json()["ok"] is True
