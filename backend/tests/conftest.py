"""
Shared pytest fixtures for backend tests.

Sets DATABASE_URL and SECRET_KEY before any app code is imported, so pydantic-settings
picks up the SQLite in-memory URL instead of requiring a running Postgres instance.
"""
import os
from unittest.mock import MagicMock

# --- must happen before any app import ---
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_kegelkasse.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-min-32-chars-ok-yes")
os.environ.setdefault("VAPID_PRIVATE_KEY", "")
os.environ.setdefault("VAPID_PUBLIC_KEY", "")

# core/database.py builds an async engine from DATABASE_URL using asyncpg.
# SQLite has no async driver in the default install, so we stub the async
# engine before anything imports core.database.
import sqlalchemy.ext.asyncio as _sa_async  # noqa: E402

_sa_async.create_async_engine = lambda *a, **kw: MagicMock()  # type: ignore[assignment]

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

# Import all models so Base.metadata knows every table
import models  # noqa: E402, F401

from core.database import Base, get_db  # noqa: E402
from core.security import create_access_token, get_password_hash  # noqa: E402
from main import app  # noqa: E402
from models.club import Club  # noqa: E402
from models.push import PushSubscription  # noqa: E402
from models.user import User, UserRole  # noqa: E402

SQLITE_URL = "sqlite://"  # pure in-memory; StaticPool keeps one shared connection


@pytest.fixture(scope="session")
def engine():
    e = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=e)
    yield e
    Base.metadata.drop_all(bind=e)


@pytest.fixture()
def db(engine):
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture()
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Domain fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def club(db):
    c = Club(name="Test Club", slug="test-club")
    db.add(c)
    db.commit()
    db.refresh(c)
    yield c
    db.query(PushSubscription).filter(PushSubscription.user_id.in_(
        [u.id for u in db.query(User).filter(User.club_id == c.id).all()]
    )).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == c.id).delete(synchronize_session=False)
    db.delete(c)
    db.commit()


@pytest.fixture()
def user(db, club):
    u = User(
        email="member@test.de",
        name="Test Member",
        hashed_password=get_password_hash("testpass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def second_user(db, club):
    u = User(
        email="member2@test.de",
        name="Second Member",
        hashed_password=get_password_hash("testpass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def auth_headers(user):
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def subscription(db, user):
    sub = PushSubscription(
        user_id=user.id,
        endpoint="https://push.example.com/test-endpoint",
        p256dh="test-p256dh-key",
        auth="test-auth-key",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    yield sub
    try:
        db.delete(sub)
        db.commit()
    except Exception:
        db.rollback()
