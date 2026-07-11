import io

import pytest


@pytest.mark.asyncio
async def test_upload_resume_pdf(authenticated_client):
    content = b"%PDF-1.4 fake pdf content for testing resume upload"
    files = {"file": ("resume.pdf", io.BytesIO(content), "application/pdf")}
    resp = await authenticated_client.post("/api/profile/resume", files=files)
    assert resp.status_code == 201
    data = resp.json()
    assert "skills" in data


@pytest.mark.asyncio
async def test_get_resume(authenticated_client):
    content = b"%PDF-1.4 fake pdf"
    files = {"file": ("resume.pdf", io.BytesIO(content), "application/pdf")}
    await authenticated_client.post("/api/profile/resume", files=files)
    resp = await authenticated_client.get("/api/profile/resume")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_resume_not_found(authenticated_client):
    resp = await authenticated_client.get("/api/profile/resume")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_unsupported_type(authenticated_client):
    files = {"file": ("resume.txt", io.BytesIO(b"text"), "text/plain")}
    resp = await authenticated_client.post("/api/profile/resume", files=files)
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_oversized(authenticated_client):
    content = b"x" * (6 * 1024 * 1024)
    files = {"file": ("big.pdf", io.BytesIO(content), "application/pdf")}
    resp = await authenticated_client.post("/api/profile/resume", files=files)
    assert resp.status_code == 413
