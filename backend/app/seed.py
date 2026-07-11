"""Seed demo data for AI Technical Interview Coach."""
import asyncio
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select

from app.agents.graph import get_interview_graph
from app.core.security import hash_password
from app.database import AsyncSessionLocal, Base, engine
from app.models.evaluation_signal import EvaluationSignal
from app.models.interview_session import InterviewSession
from app.models.learning_plan import LearningPlan
from app.models.progress_history import ProgressHistory
from app.models.question_attempt import QuestionAttempt
from app.models.resume_profile import ResumeProfile
from app.models.user import User

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo12345"


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == DEMO_EMAIL))
        if existing.scalar_one_or_none():
            print(f"Demo user already exists: {DEMO_EMAIL}")
            return

        user = User(
            name="Demo Candidate",
            email=DEMO_EMAIL,
            hashed_password=hash_password(DEMO_PASSWORD),
            role="candidate",
            experience_level="mid",
            target_role="Full Stack Engineer",
        )
        db.add(user)
        await db.flush()

        profile = ResumeProfile(
            user_id=user.id,
            raw_file_path="media/resumes/demo.pdf",
            skills=["Python", "React", "PostgreSQL", "FastAPI"],
            projects=[
                {"name": "Interview Coach", "description": "AI interview platform", "tech_stack": ["Python", "React"]}
            ],
            experience_summary="5 years of full-stack development experience.",
        )
        db.add(profile)

        session = InterviewSession(
            user_id=user.id,
            target_role="Full Stack Engineer",
            status="completed",
            current_stage="complete",
            start_time=datetime.utcnow() - timedelta(hours=1),
            end_time=datetime.utcnow(),
        )
        db.add(session)
        await db.flush()

        questions = [
            ("technical", "Explain the difference between REST and GraphQL.", 82.0),
            ("followup", "Can you give a concrete example from a project?", 70.0),
            ("technical", "How would you design a caching layer for a high-traffic API?", 75.0),
            ("scenario", "Describe how you would debug a production outage.", 68.0),
            ("technical", "What are the trade-offs of microservices vs monolith?", 80.0),
        ]

        for i, (agent_type, question, score) in enumerate(questions, 1):
            attempt = QuestionAttempt(
                session_id=session.id,
                agent_type=agent_type,
                question_text=question,
                answer_text="Sample answer demonstrating technical knowledge.",
                score=score,
                sequence_number=i,
            )
            db.add(attempt)
            await db.flush()

            signal_type = "technical" if agent_type in ("technical", "followup") else "communication"
            db.add(
                EvaluationSignal(
                    attempt_id=attempt.id,
                    type=signal_type,
                    score=score,
                    notes=f"Demo evaluation: {'Strong' if score >= 75 else 'Adequate'} understanding demonstrated.",
                )
            )
            db.add(
                EvaluationSignal(
                    attempt_id=attempt.id,
                    type="confidence",
                    score=score - 5,
                    notes="Confidence proxy based on answer structure and clarity.",
                )
            )

        overall = sum(q[2] for q in questions) / len(questions)

        db.add(
            LearningPlan(
                user_id=user.id,
                session_id=session.id,
                weak_areas=["system design depth", "production debugging"],
                recommended_resources=[
                    {"title": "System Design Primer", "url": "https://github.com/donnemartin/system-design-primer", "type": "guide"},
                    {"title": "Debugging Distributed Systems", "url": "https://example.com/debugging", "type": "article"},
                ],
            )
        )

        db.add(
            ProgressHistory(
                user_id=user.id,
                session_id=session.id,
                overall_score=overall,
                trend_metrics={"technical": 75.0, "communication": 69.0, "confidence": 72.0, "engagement": 0},
            )
        )

        graph = get_interview_graph()
        await graph.init_session(str(session.id), str(user.id), session.target_role, {
            "skills": profile.skills,
            "projects": profile.projects,
            "experience_summary": profile.experience_summary,
        })

        await db.commit()
        print(f"Seeded demo user: {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
