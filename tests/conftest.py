import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.core.config import MODEL_BUNDLE  # noqa: E402


@pytest.fixture(scope="session")
def model():
    if not MODEL_BUNDLE.exists():
        pytest.skip("model bundle not trained yet")
    from backend.services.inference import ScamPrint
    return ScamPrint.load(MODEL_BUNDLE)


@pytest.fixture(scope="session")
def client():
    if not MODEL_BUNDLE.exists():
        pytest.skip("model bundle not trained yet")
    from fastapi.testclient import TestClient
    from backend.main import app
    with TestClient(app) as c:
        yield c
