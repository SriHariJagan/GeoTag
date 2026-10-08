"""Shared V3 test setup: ONE isolated DB + ONE get_db override + mocked SMTP.

All test modules run against this database. Emails must be unique across files.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

# Automated suites bypass in-memory rate limits (see routers' _rate_check).
# Must be set before app import.
os.environ["ENV"] = "test"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

TEST_DB = "./test_v3.db"
if os.path.exists(TEST_DB):
    os.remove(TEST_DB)

from app.core.database import Base, get_db  # noqa: E402
import app.modules.users.models  # noqa: F401,E402
import app.modules.projects.models  # noqa: F401,E402
import app.modules.vendors.models  # noqa: F401,E402
import app.modules.machinery.models  # noqa: F401,E402
import app.modules.daily_execution.models  # noqa: F401,E402
import app.modules.Expenditure.models  # noqa: F401,E402
import app.modules.project_expenditures.models  # noqa: F401,E402
try:
    import app.modules.procurement.models  # noqa: F401,E402
except ImportError:
    pass
from app.main import app  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.modules.users.models import User  # noqa: E402
import app.core.email as email_mod  # noqa: E402

engine = create_engine(f"sqlite:///{TEST_DB}", connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

db0 = TestingSession()
db0.add(User(email="admin@geotech.com", full_name="Admin", role="SUPERADMIN",
             account_status="ACTIVE", hashed_password=hash_password("Admin@123"),
             is_active=True))
db0.commit()
db0.close()


def _override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_db

client = TestClient(app, raise_server_exceptions=False)

_MAILBOX: dict = {}


@pytest.fixture(scope="session", autouse=True)
def _mock_smtp():
    """Session-wide SMTP mock (module- and function-scoped fixtures run inside it)."""
    real_send = email_mod.send_invite_email
    real_deliver = email_mod._deliver

    class _Fake:
        def __call__(self, to_email, invite_link, **kwargs):
            _MAILBOX["last"] = (to_email, invite_link, kwargs)

    email_mod.send_invite_email = _Fake()
    email_mod._deliver = lambda msg: None
    _MAILBOX.clear()
    yield
    email_mod.send_invite_email = real_send
    email_mod._deliver = real_deliver
    _MAILBOX.clear()


def last_invite():
    assert _MAILBOX.get("last") is not None, "no invitation email captured"
    return _MAILBOX["last"]


def login(email="admin@geotech.com", password="Admin@123"):
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session", autouse=True)
def _cleanup_db():
    yield
    engine.dispose()
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except OSError:
            pass
