import uuid

import pytest


@pytest.mark.asyncio
async def test_register_success(client):
    resp = await client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "alice@example.com"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {"name": "Alice", "email": "dup@example.com", "password": "password123"}
    await client.post("/api/auth/register", json=payload)
    resp = await client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_register_invalid_email(client):
    resp = await client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "not-an-email", "password": "password123"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password(client):
    resp = await client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "short@example.com", "password": "short"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post(
        "/api/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "password123"},
    )
    resp = await client.post("/api/auth/login", json={"email": "bob@example.com", "password": "password123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post(
        "/api/auth/register",
        json={"name": "Bob", "email": "bob2@example.com", "password": "password123"},
    )
    resp = await client.post("/api/auth/login", json={"email": "bob2@example.com", "password": "wrongpass"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_nonexistent_email(client):
    resp = await client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_refresh_token(client):
    reg = await client.post(
        "/api/auth/register",
        json={"name": "Carol", "email": "carol@example.com", "password": "password123"},
    )
    refresh = reg.json()["refresh_token"]
    resp = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_refresh_invalid_token(client):
    resp = await client.post("/api/auth/refresh", json={"refresh_token": "invalid.token.here"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_token(authenticated_client):
    refresh = authenticated_client._refresh_token
    resp = await authenticated_client.post("/api/auth/logout", json={"refresh_token": refresh})
    assert resp.status_code == 204
    resp2 = await authenticated_client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert resp2.status_code == 401
