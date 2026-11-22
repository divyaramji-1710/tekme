import ast
import logging
import socket
from pathlib import Path

import pytest

from backend.core import config, privacy

ROOT = Path(__file__).resolve().parents[2]
SECRET = "Unique-canary-message 7Q9Z pay Rs 999 to claim"


def test_guard_blocks_external_and_allows_loopback():
    privacy.install_network_guard()
    before = privacy.guard_state()["blocked_attempts"]
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    with pytest.raises(ConnectionRefusedError):
        s.connect(("93.184.216.34", 80))  # any public address
    s.close()
    assert privacy.guard_state()["blocked_attempts"] == before + 1
    # loopback is allowed (connection may be refused because nothing listens - that's fine)
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    c.connect(srv.getsockname())
    c.close()
    srv.close()


def test_prediction_makes_no_outbound_attempts(model):
    """Every socket.connect to a non-loopback address is counted by the guard."""
    privacy.install_network_guard()
    before = privacy.guard_state()["blocked_attempts"]
    for t in ["Win Rs 5 lakh now http://prize-claim.example", "Your OTP is 1234", "Visit bit.ly/abc to update KYC"]:
        model.predict(t)
    model.predict_batch(["call 9876543210 now"] * 5)
    assert privacy.guard_state()["blocked_attempts"] == before


def test_model_loads_with_dns_disabled(monkeypatch):
    def no_dns(*a, **k):
        raise OSError("DNS disabled for test")
    monkeypatch.setattr(socket, "getaddrinfo", no_dns)
    monkeypatch.setattr(socket, "gethostbyname", no_dns)
    if not config.MODEL_BUNDLE.exists():
        pytest.skip("no bundle")
    from backend.services.inference import ScamPrint
    m = ScamPrint.load(config.MODEL_BUNDLE)
    assert m.predict("Your parcel is out for delivery")["verdict"] in ("SAFE", "SCAM")


def test_no_raw_message_logging(client, caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/predict", json={"text": SECRET})
        client.post("/evaluate-mutations", json={"text": SECRET})
    assert SECRET not in caplog.text
    assert "7Q9Z" not in caplog.text


def test_local_only_configuration():
    assert config.HOST in ("127.0.0.1", "localhost")
    assert all(o.startswith(("http://localhost", "http://127.0.0.1")) for o in config.CORS_ORIGINS)
    assert config.LOG_MESSAGES is False


def test_backend_has_no_network_client_imports():
    banned = {"requests", "httpx", "urllib3", "aiohttp", "http.client", "socketio", "openai", "anthropic"}
    found = []
    for py in (ROOT / "backend").rglob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for n in names:
                if n in banned or n.split(".")[0] in banned:
                    found.append(f"{py.name}: {n}")
    assert not found, found


def test_frontend_build_has_no_remote_assets():
    dist = ROOT / "frontend" / "dist"
    if not dist.exists():
        pytest.skip("frontend not built")
    import re
    for f in dist.rglob("*"):
        if f.suffix in (".html", ".js", ".css"):
            txt = f.read_text(encoding="utf-8", errors="ignore")
            assert not re.search(r"<(?:script|link)[^>]+(?:src|href)=[\"'](?:https?:)?//", txt), f
            assert "fonts.googleapis" not in txt and "googletagmanager" not in txt and "cdn." not in txt
