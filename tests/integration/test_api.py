import pytest

SCAM = "Dear SBI customer, your KYC has expired and your account will be blocked within 24 hours. Update immediately: http://sbi-kyc-verify.example/login"
OTP = "483921 is your OTP for login to NetBanking. Valid for 5 minutes. Do not share this OTP with anyone."


def test_health(client):
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["model_loaded"] is True


def test_api_prefix_alias(client):
    assert client.get("/api/health").status_code == 200


def test_model_info(client):
    r = client.get("/model/info").json()
    assert r["threshold"] == 0.5 and r["feature_count"] > 40 and r["bundle_size_mb"] > 0


@pytest.mark.parametrize("text,verdict", [(SCAM, "SCAM"), (OTP, "SAFE")])
def test_predict_schema_and_consistency(client, text, verdict):
    r = client.post("/predict", json={"text": text})
    assert r.status_code == 200
    d = r.json()
    assert d["verdict"] == verdict
    assert 0.5 <= d["confidence"] <= 1.0
    expected_conf = d["scam_probability"] if d["verdict"] == "SCAM" else 1 - d["scam_probability"]
    assert abs(d["confidence"] - expected_conf) < 1e-3
    assert d["explanation"] and d["confidence_interpretation"]["text"]
    for h in d["highlights"]:
        assert text[h["start"]:h["end"]] == h["text"]
    if verdict == "SAFE":
        assert d["category"] is None
    else:
        assert d["category"] in {"KYC_BANK", "LOTTERY_PRIZE", "LOAN_CREDIT", "JOB_INVESTMENT", "OTHER"}


def test_scam_category_kyc(client):
    assert client.post("/predict", json={"text": SCAM}).json()["category"] == "KYC_BANK"


@pytest.mark.parametrize("payload", [{"text": ""}, {"text": "   "}, {"text": "x" * 2001}, {}, {"text": 5}])
def test_invalid_input(client, payload):
    r = client.post("/predict", json=payload)
    assert r.status_code == 422
    assert "x" * 50 not in r.text  # never echo the submitted text


def test_mutate_and_evaluate(client):
    r = client.post("/mutate", json={"text": SCAM, "types": ["spacing", "hinglish"]}).json()
    assert {m["type"] for m in r} == {"spacing", "hinglish"}
    r = client.post("/evaluate-mutations", json={"text": SCAM, "expected_label": "SCAM"}).json()
    s = r["summary"]
    assert s["n_variants"] == 11 and 0 <= s["consistency"] <= 1 and s["accuracy_vs_expected"] is not None
    r = client.post("/evaluate-mutations", json={"text": SCAM}).json()
    assert r["summary"]["accuracy_vs_expected"] is None  # without ground truth only consistency


def test_unknown_mutation_type_rejected(client):
    assert client.post("/mutate", json={"text": SCAM, "types": ["bogus"]}).status_code == 422


def test_metrics_and_privacy_and_examples(client):
    m = client.get("/metrics")
    assert m.status_code in (200, 404)
    p = client.get("/privacy/status").json()
    assert p["bound_to_loopback"] and p["all_model_files_local"] and p["network_guard"]["active"]
    ex = client.get("/examples").json()["examples"]
    assert len(ex) >= 10


def test_cors_restricted(client):
    r = client.options("/predict", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") is None
    r = client.options("/predict", headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"


def test_security_headers(client):
    h = client.get("/health").headers
    assert h["cache-control"] == "no-store" and "default-src 'self'" in h["content-security-policy"]
