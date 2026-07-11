import pytest


@pytest.mark.asyncio
async def test_get_me(authenticated_client):
    resp = await authenticated_client.get("/api/users/me")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test User"


@pytest.mark.asyncio
async def test_get_me_no_token(client):
    resp = await client.get("/api/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_update_me(authenticated_client):
    resp = await authenticated_client.put(
        "/api/users/me",
        json={"name": "Updated Name", "target_role": "Senior Engineer"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
    assert resp.json()["target_role"] == "Senior Engineer"
