import pytest

@pytest.mark.parametrize("dataset_name", [
    "students",
    "rooms",
    "contracts",
    "fees",
    "violations",
])
def test_get_dataset(client, dataset_name):
    response = client.get(f"/api/datasets/{dataset_name}?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "rows" in data
    assert isinstance(data["rows"], list)

def test_get_invalid_dataset(client):
    response = client.get("/api/datasets/invalid_dataset_name")
    assert response.status_code == 404
