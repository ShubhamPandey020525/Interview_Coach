import pytest


@pytest.mark.asyncio
async def test_create_session_requires_resume(authenticated_client):
    resp = await authenticated_client.post("/api/sessions", json={"session_name": "Practice 1"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_session(authenticated_client_with_resume):
    resp = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Backend Practice"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "created"
    assert data["session_name"] == "Backend Practice"
    assert data["target_role"] == "Software Engineer"


@pytest.mark.asyncio
async def test_list_sessions(authenticated_client_with_resume):
    await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    resp = await authenticated_client_with_resume.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_session(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    resp = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_next_question(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    resp = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}/next-question")
    assert resp.status_code == 200
    assert "question_text" in resp.json()


@pytest.mark.asyncio
async def test_submit_answer(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    q = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}/next-question")
    attempt_id = q.json()["attempt_id"]
    resp = await authenticated_client_with_resume.post(
        f"/api/sessions/{session_id}/answer",
        data={"attempt_id": attempt_id, "answer_text": "A detailed technical answer about APIs and databases."},
    )
    assert resp.status_code == 200
    assert resp.json()["score"] is not None


@pytest.mark.asyncio
async def test_complete_session(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    q = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}/next-question")
    attempt_id = q.json()["attempt_id"]
    await authenticated_client_with_resume.post(
        f"/api/sessions/{session_id}/answer",
        data={"attempt_id": attempt_id, "answer_text": "A good answer with enough words to score well."},
    )
    resp = await authenticated_client_with_resume.post(f"/api/sessions/{session_id}/complete")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_report_after_complete(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    q = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}/next-question")
    await authenticated_client_with_resume.post(
        f"/api/sessions/{session_id}/answer",
        data={"attempt_id": q.json()["attempt_id"], "answer_text": "Detailed answer here with technical content."},
    )
    await authenticated_client_with_resume.post(f"/api/sessions/{session_id}/complete")
    resp = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}/report")
    assert resp.status_code == 200
    assert "overall_score" in resp.json()


@pytest.mark.asyncio
async def test_report_before_complete(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    resp = await authenticated_client_with_resume.get(f"/api/sessions/{session_id}/report")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_session(authenticated_client_with_resume):
    create = await authenticated_client_with_resume.post("/api/sessions", json={"session_name": "Test Session"})
    session_id = create.json()["id"]
    resp = await authenticated_client_with_resume.delete(f"/api/sessions/{session_id}")
    assert resp.status_code == 204
