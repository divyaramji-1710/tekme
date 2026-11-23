"""The iOS compact model: re-score the fixtures from the exported JSON using only plain arithmetic, exactly the
steps ios/Shared/TekmeClassifier.swift performs (no scikit-learn). This validates the export and the algorithm the
Swift port implements; it does NOT validate the Swift code itself, which has not been compiled."""
from __future__ import annotations

import json
import math

import pytest

from backend.core.config import ROOT
from ml.export.ios_model import compact_text

MODEL = ROOT / "ios" / "Shared" / "tekme_compact.json"
FIX = ROOT / "ios" / "Tests" / "Fixtures" / "expected.json"
pytestmark = pytest.mark.skipif(not MODEL.exists(), reason="run python -m ml.export.ios_model first")


def score(m: dict, index: dict, ct: str) -> float:
    words = ct.split(" ") if ct else []
    counts: dict[int, float] = {}
    for term in words + [f"{a} {b}" for a, b in zip(words, words[1:])]:
        j = index.get(term)
        if j is not None:
            counts[j] = counts.get(j, 0) + 1
    vec = {j: (1 + math.log(c)) * m["idf"][j] for j, c in counts.items()}
    norm = math.sqrt(sum(v * v for v in vec.values()))
    z = m["intercept"] + (sum(m["coef"][j] * v / norm for j, v in vec.items()) if norm else 0.0)
    return 1 / (1 + math.exp(-(m["platt_a"] * z + m["platt_b"])))


def test_plain_arithmetic_reproduces_reference():
    m = json.loads(MODEL.read_text(encoding="utf-8"))
    index = {t: i for i, t in enumerate(m["terms"])}
    fixtures = json.loads(FIX.read_text(encoding="utf-8"))
    assert len(fixtures) >= 20
    for f in fixtures:
        assert compact_text(f["text"]) == f["compact_text"]
        p = score(m, index, f["compact_text"])
        assert abs(p - f["probability"]) < 1e-4, f["text"]
        assert (p >= m["junk_threshold"]) == f["junk"]


def test_genuine_otp_is_not_filtered_and_no_network_key():
    m = json.loads(MODEL.read_text(encoding="utf-8"))
    index = {t: i for i, t in enumerate(m["terms"])}
    p = score(m, index, compact_text("483921 is your OTP for login. Valid for 5 minutes. Do not share it with anyone."))
    assert p < m["junk_threshold"]
    plist = (ROOT / "ios" / "TEKMEFilter" / "Info.plist").read_text(encoding="utf-8")
    assert "<key>ILMessageFilterExtensionNetworkURL</key>" not in plist
    swift = (ROOT / "ios" / "TEKMEFilter" / "MessageFilterExtension.swift").read_text(encoding="utf-8")
    assert "deferQueryRequestToNetwork(" not in swift.replace("`context.deferQueryRequestToNetwork` is never called", "")
