from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

TEMP_DIR = Path(tempfile.mkdtemp(prefix="clashfree-tests-"))
os.environ["CLASHFREE_DATA_DIR"] = str(TEMP_DIR)
os.environ["CLASHFREE_DB_PATH"] = str(TEMP_DIR / "test.db")
os.environ.pop("OPENAI_API_KEY", None)
os.environ["ENABLE_PLAYWRIGHT"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    shutil.rmtree(TEMP_DIR, ignore_errors=True)


@pytest.fixture(autouse=True)
def fresh_demo(client):
    # Tests that upload a custom source must not leak it into the next test.
    for source in client.get("/api/sources").json()["sources"]:
        if source["kind"] != "demo":
            client.delete(f"/api/sources/{source['id']}")
    response = client.post("/api/demo/reset")
    assert response.status_code == 200
    yield


@pytest.fixture()
def demo(client):
    dashboard = client.get("/api/dashboard").json()
    source_id = dashboard["recentSources"][0]["id"]
    return {"client": client, "dashboard": dashboard, "source_id": source_id}
