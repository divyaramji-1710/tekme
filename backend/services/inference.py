"""Inference service: one code path for training features, evaluation and the API.

All computation is local. ``TekmeModel.load()`` reads a single joblib bundle
from ``ml/artifacts`` once; predictions never touch the network.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np

from backend.core.config import CATEGORY_LABELS, MODEL_BUNDLE
from backend.engines import benign_protection, semantic, tactics, trust_signals
from backend.engines.categorizer import category_text
from backend.preprocessing.normalizer import Preprocessed, preprocess


@dataclass
class EngineOutput:
    pre: Preprocessed
    tactic_hits: list
    signals: list
    url_info: list
    benign: benign_protection.BenignReport
    features: dict

    @property
    def transactional(self) -> bool:
        f = self.features
        return bool(f["has_url"] or f["has_phone"] or f["has_money"] or f["otp_mention"] or f["pin_mention"]
                    or f["brand_mentioned"] or f["has_upi"] or f["has_email"] or f["benign_template_count"] > 0)


def run_engines(text: str) -> EngineOutput:
    pre = preprocess(text)
    hits = tactics.detect(pre)
    sigs, tfeat, url_info = trust_signals.analyse(pre)
    brep, bfeat = benign_protection.analyse(pre, hits, tfeat)
    feats = {**tactics.features(hits), **tfeat, **bfeat}
    return EngineOutput(pre, hits, sigs, url_info, brep, feats)


class TekmeModel:
    """Loaded model bundle + prediction logic."""

    def __init__(self, bundle: dict, path: Path | None = None):
        self.bundle = bundle
        self.path = path
        self.semantic = bundle["semantic"]
        self.specialist = bundle["specialist"]
        self.fusion = bundle["fusion"]
        self.category = bundle["category"]
        self.threshold = float(bundle["threshold"])
        self.borderline = tuple(bundle.get("borderline_band", (0.35, 0.65)))
        self.meta = bundle.get("metadata", {})

    @classmethod
    def load(cls, path: Path = MODEL_BUNDLE) -> "TekmeModel":
        t0 = time.perf_counter()
        obj = cls(joblib.load(path), path)
        obj.load_seconds = time.perf_counter() - t0
        return obj

    # ---------------------------------------------------------------- core
    def _rows(self, outs: list[EngineOutput]) -> list[dict]:
        texts = [o.pre.model_text for o in outs]
        sem = semantic.decision(self.semantic, texts)
        spec = semantic.decision(self.specialist, texts)
        rows = []
        for o, s, sp in zip(outs, sem, spec):
            appl = o.transactional
            rows.append({**o.features, "sem_logit": float(s), "spec_logit": float(sp) if appl else 0.0,
                         "spec_applicable": float(appl)})
        return rows

    def scam_probability(self, texts: list[str]) -> tuple[np.ndarray, list[EngineOutput], list[dict]]:
        outs = [run_engines(t) for t in texts]
        rows = self._rows(outs)
        return self.fusion.proba(rows), outs, rows

    def predict_batch(self, texts: list[str], with_category: bool = True) -> list[dict]:
        """Light-weight predictions (used by evaluation and the Mutation Lab)."""
        p, outs, rows = self.scam_probability(texts)
        verdicts = ["SCAM" if pi >= self.threshold else "SAFE" for pi in p]
        cats: dict[int, tuple] = {}
        if with_category:
            idx = [i for i, v in enumerate(verdicts) if v == "SCAM"]
            if idx:
                ctexts = [category_text(outs[i].pre.model_text, [h.id for h in outs[i].tactic_hits]) for i in idx]
                for i, c in zip(idx, self.category.predict(ctexts)):
                    cats[i] = c
        res = []
        for i, (pi, v) in enumerate(zip(p, verdicts)):
            conf = float(pi) if v == "SCAM" else float(1 - pi)
            res.append({"verdict": v, "scam_probability": float(pi), "confidence": conf,
                        "category": cats[i][0] if i in cats else None,
                        "borderline": self.borderline[0] <= pi <= self.borderline[1]})
        return res

    def predict(self, text: str) -> dict:
        """Full prediction with evidence and explanation (used by POST /predict)."""
        from backend.explainability.explainer import explain

        t0 = time.perf_counter()
        p, outs, rows = self.scam_probability([text])
        o, row, pi = outs[0], rows[0], float(p[0])
        verdict = "SCAM" if pi >= self.threshold else "SAFE"
        confidence = pi if verdict == "SCAM" else 1 - pi
        category = None
        cat_probs = None
        if verdict == "SCAM":
            c, _, probs = self.category.predict([category_text(o.pre.model_text, [h.id for h in o.tactic_hits])])[0]
            category, cat_probs = c, {k: round(v, 4) for k, v in probs.items()}
        contributions = self.fusion.contributions(row)
        words = semantic.word_contributions(self.semantic, o.pre.model_text)
        result = {
            "verdict": verdict,
            "category": category,
            "category_label": CATEGORY_LABELS.get(category) if category else None,
            "confidence": round(confidence, 4),
            "scam_probability": round(pi, 4),
            "borderline": self.borderline[0] <= pi <= self.borderline[1],
            "language": o.pre.language,
            "normalized_text": o.pre.normalized,
            "tactics": [h.as_dict() for h in o.tactic_hits],
            "risk_signals": [s.as_dict() for s in o.signals],
            "benign": o.benign.as_dict(),
            "category_probabilities": cat_probs,
            "obfuscation": o.pre.obfuscation.as_dict(),
        }
        result.update(explain(result, o, contributions, words, self.threshold))
        result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        return result

    def info(self) -> dict:
        m = dict(self.meta)
        m["threshold"] = self.threshold
        m["borderline_band"] = list(self.borderline)
        m["bundle_path"] = str(self.path) if self.path else None
        m["bundle_size_mb"] = round(self.path.stat().st_size / 1e6, 2) if self.path and self.path.exists() else None
        m["load_seconds"] = round(getattr(self, "load_seconds", 0.0), 3)
        return m
