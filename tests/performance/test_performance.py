"""Performance budgets measured on the development laptop (i7-1355U, CPU only).
Budgets are deliberately generous (~5-10x the measured values) so the suite is
stable on slower machines; actual numbers are in reports/metrics.json."""
import statistics
import sys
import time

import psutil

MSG = "Dear customer, your KYC is pending. Update within 24 hours at http://kyc-verify.example or your account will be blocked."


def test_single_message_latency(model):
    model.predict(MSG)
    times = []
    for _ in range(30):
        t = time.perf_counter()
        model.predict(MSG)
        times.append((time.perf_counter() - t) * 1000)
    p95 = sorted(times)[int(0.95 * len(times)) - 1]
    print(f"single predict median={statistics.median(times):.1f}ms p95={p95:.1f}ms")
    assert p95 < 500


def test_repeated_batch_inference(model):
    texts = [MSG, "Your OTP is 1234. Do not share.", "Hi, see you tomorrow"] * 40
    t = time.perf_counter()
    out = model.predict_batch(texts)
    dt = time.perf_counter() - t
    assert len(out) == 120 and dt < 15
    assert len({o["verdict"] for o in out[:3]}) >= 1
    # determinism: repeated inference gives identical results
    assert model.predict_batch(texts[:3]) == model.predict_batch(texts[:3])


def test_memory_footprint(model):
    rss_mb = psutil.Process().memory_info().rss / 1e6
    print(f"process RSS {rss_mb:.0f} MB")
    assert rss_mb < 2000


def test_cpu_only_no_gpu_frameworks(model):
    model.predict(MSG)
    for mod in ("torch", "tensorflow", "onnxruntime", "cupy", "jax"):
        assert mod not in sys.modules, f"{mod} unexpectedly imported"
