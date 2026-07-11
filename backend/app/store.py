import uuid
from datetime import datetime

class InMemoryModel:
    """Helper to store session details and attempts dynamically in memory."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def __repr__(self):
        return f"InMemoryModel({self.__dict__})"

class MockUser:
    """Helper to type-hint and access the dummy candidate profile."""
    def __init__(self, id, name, email, role="user", target_role="Software Engineer", experience_level="junior"):
        self.id = id
        self.name = name
        self.email = email
        self.role = role
        self.target_role = target_role
        self.experience_level = experience_level
        self.is_active = True
        self.created_at = datetime.utcnow()

# Seed standard UUID for demo user
DEMO_USER_ID = uuid.UUID("9cc71b23-2008-49a2-b351-d85bcbb049af")

# Transient local caches (no database connections/files)
_in_memory_users = {
    DEMO_USER_ID: MockUser(
        id=DEMO_USER_ID,
        name="Demo User",
        email="demo@example.com"
    )
}
_in_memory_sessions = {}
_in_memory_attempts = {}
_in_memory_resumes = {}
_in_memory_learning_plans = {}
