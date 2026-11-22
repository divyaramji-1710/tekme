"""Scam category classifier (only run for SCAM verdicts).

Multinomial logistic regression over the semantic text plus tactic tokens.
If no specific category is sufficiently supported (max probability among the
four specific categories below a threshold tuned on validation data), the
message is assigned OTHER instead of forcing an unsupported label.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline

from backend.core.config import CATEGORIES

SPECIFIC = [c for c in CATEGORIES if c != "OTHER"]


def category_text(model_text: str, tactic_ids: list[str]) -> str:
    return model_text + " " + " ".join(f"zztactic{t.replace('_', '')}" for t in tactic_ids)


def make_pipeline(C: float = 4.0) -> Pipeline:
    vec = FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, token_pattern=r"(?u)\b\w+\b")),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, max_features=80000, sublinear_tf=True)),
    ])
    clf = LogisticRegression(C=C, class_weight="balanced", max_iter=4000)
    return Pipeline([("vec", vec), ("clf", clf)])


@dataclass
class CategoryModel:
    pipeline: Pipeline
    other_threshold: float

    def proba(self, texts: list[str]) -> tuple[np.ndarray, list[str]]:
        p = self.pipeline.predict_proba(texts)
        return p, list(self.pipeline.classes_)

    def predict(self, texts: list[str]) -> list[tuple[str, float, dict[str, float]]]:
        p, classes = self.proba(texts)
        out = []
        for row in p:
            probs = dict(zip(classes, row.tolist()))
            best = max(classes, key=lambda c: probs[c])
            if best != "OTHER" and probs[best] < self.other_threshold:
                best = "OTHER"
            out.append((best, probs[best], probs))
        return out
