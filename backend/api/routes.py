"""HTTP routes. All handlers run local inference only."""
from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request

from backend.api.schemas import (EvaluateMutationsRequest, EvaluateMutationsResponse, MutateRequest, MutationOut,
                                 PredictRequest, PredictResponse)
from backend.core import config, privacy
from backend.services import mutations

log = logging.getLogger("tekme")
router = APIRouter()


def _model(request: Request):
    m = getattr(request.app.state, "model", None)
    if m is None:
        raise HTTPException(status_code=503, detail="Model bundle not loaded. Run the training pipeline first.")
    return m


def _log_request(kind: str, text: str, t0: float) -> None:
    if config.LOG_MESSAGES:
        log.info("%s len=%d ms=%.1f text=%r", kind, len(text), (time.perf_counter() - t0) * 1000, text)
    else:  # default: never log message contents
        log.info("%s len=%d ms=%.1f", kind, len(text), (time.perf_counter() - t0) * 1000)


@router.get("/health")
def health(request: Request) -> dict:
    m = getattr(request.app.state, "model", None)
    return {"status": "ok" if m else "degraded", "model_loaded": m is not None,
            "model_version": m.meta.get("model_version") if m else None,
            "error": getattr(request.app.state, "load_error", None)}


@router.get("/model/info")
def model_info(request: Request) -> dict:
    return _model(request).info()


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, request: Request) -> dict:
    t0 = time.perf_counter()
    res = _model(request).predict(req.text)
    _log_request("predict", req.text, t0)
    return res


@router.post("/mutate", response_model=list[MutationOut])
def mutate(req: MutateRequest) -> list[dict]:
    muts = mutations.generate(req.text, req.types, req.variants_per_type, req.seed)[: config.MAX_MUTATIONS]
    return [m.__dict__ for m in muts]


@router.post("/evaluate-mutations", response_model=EvaluateMutationsResponse)
def evaluate_mutations(req: EvaluateMutationsRequest, request: Request) -> dict:
    t0 = time.perf_counter()
    model = _model(request)
    muts = mutations.generate(req.text, req.types, req.variants_per_type, req.seed)[: config.MAX_MUTATIONS]
    preds = model.predict_batch([req.text] + [m.text for m in muts])  # batched: one vectoriser pass
    orig, rest = preds[0], preds[1:]
    variants = []
    for m, p in zip(muts, rest):
        variants.append({**m.__dict__, "verdict": p["verdict"], "confidence": round(p["confidence"], 4),
                         "scam_probability": round(p["scam_probability"], 4), "category": p["category"],
                         "verdict_changed": p["verdict"] != orig["verdict"]})
    n = len(variants)
    same = sum(not v["verdict_changed"] for v in variants)
    probs = [v["scam_probability"] for v in variants] or [orig["scam_probability"]]
    acc = None
    note = ("Consistency = share of variants that keep the original verdict. It measures stability, not "
            "correctness: a consistently wrong model is also consistent.")
    if req.expected_label:
        acc = round(sum(v["verdict"] == req.expected_label for v in variants) / max(n, 1), 4)
        note = f"Accuracy is measured against the expected label you supplied ({req.expected_label}). " + note
    summary = {"n_variants": n, "n_changed_text": sum(v["changed"] for v in variants),
               "consistency": round(same / max(n, 1), 4), "verdict_flips": n - same,
               "mean_confidence": round(sum(v["confidence"] for v in variants) / max(n, 1), 4),
               "min_scam_probability": round(min(probs), 4), "max_scam_probability": round(max(probs), 4),
               "accuracy_vs_expected": acc, "metric_note": note}
    orig_out = {"text": req.text, "verdict": orig["verdict"], "confidence": round(orig["confidence"], 4),
                "scam_probability": round(orig["scam_probability"], 4), "category": orig["category"]}
    _log_request("evaluate-mutations", req.text, t0)
    return {"original": orig_out, "variants": variants, "summary": summary}


@router.get("/mutation-types")
def mutation_types() -> dict:
    return {"types": [{"id": k, "description": v, "used_in_training_augmentation": k in mutations.TRAIN_AUGMENT_TYPES}
                      for k, v in mutations.MUTATION_TYPES.items()]}


@router.get("/metrics")
def metrics() -> dict:
    if not config.METRICS_FILE.exists():
        raise HTTPException(status_code=404, detail="No evaluation results yet. Run ml/evaluation/evaluate.py.")
    return json.loads(config.METRICS_FILE.read_text(encoding="utf-8"))


@router.get("/privacy/status")
def privacy_status(request: Request) -> dict:
    return privacy.status(getattr(request.app.state, "model", None) is not None)


@router.get("/examples")
def examples() -> dict:
    return json.loads((config.BACKEND_DATA / "examples.json").read_text(encoding="utf-8"))
