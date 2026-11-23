"""Central configuration. Everything is local; there are no remote endpoints."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(os.environ.get("TEKME_ARTIFACTS", ROOT / "ml" / "artifacts"))
REPORTS = ROOT / "reports"
BACKEND_DATA = ROOT / "backend" / "data"

MODEL_BUNDLE = ARTIFACTS / "tekme_bundle.joblib"
METRICS_FILE = REPORTS / "metrics.json"

# API limits
MAX_MESSAGE_CHARS = 2000
MAX_MUTATIONS = 40

# Server binds to loopback only. Override deliberately via env if ever needed.
HOST = os.environ.get("TEKME_HOST", "127.0.0.1")
PORT = int(os.environ.get("TEKME_PORT", "8000"))

# Only the local dev server / preview server may call the API.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]

# Raw message contents are never logged unless this is explicitly enabled.
LOG_MESSAGES = os.environ.get("TEKME_LOG_MESSAGES", "0") == "1"

CATEGORIES = ["KYC_BANK", "LOTTERY_PRIZE", "LOAN_CREDIT", "JOB_INVESTMENT", "OTHER"]
CATEGORY_LABELS = {
    "KYC_BANK": "KYC / Bank",
    "LOTTERY_PRIZE": "Lottery / Prize",
    "LOAN_CREDIT": "Loan / Credit",
    "JOB_INVESTMENT": "Job / Investment",
    "OTHER": "Other",
}
