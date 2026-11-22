"""Semantic detection engine: word + character TF-IDF with a linear classifier.

Linear models are used deliberately: they are fast on a CPU, small on disk and
their scores decompose exactly into per-feature contributions, which the
explainability engine reports faithfully.
"""
from __future__ import annotations

import re
from collections import defaultdict

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

TOKEN_PATTERN = r"(?u)\b\w+\b"


def make_vectorizer(word_max: int = 60000, char_max: int = 150000) -> FeatureUnion:
    return FeatureUnion([
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=2, max_features=word_max,
                                 sublinear_tf=True, token_pattern=TOKEN_PATTERN)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=3, max_features=char_max,
                                 sublinear_tf=True)),
    ])


def make_model(kind: str = "logreg", C: float = 4.0, alpha: float = 0.3) -> Pipeline:
    if kind == "logreg":
        clf = LogisticRegression(C=C, class_weight="balanced", max_iter=4000, solver="liblinear")
    elif kind == "linear_svm":
        clf = LinearSVC(C=C, class_weight="balanced")
    elif kind == "complement_nb":
        clf = ComplementNB(alpha=alpha)
    else:
        raise ValueError(kind)
    return Pipeline([("vec", make_vectorizer()), ("clf", clf)])


def decision(model: Pipeline, texts: list[str]) -> np.ndarray:
    """Real-valued score (logit for LR / margin for SVM / log-odds for NB)."""
    clf = model.named_steps["clf"]
    X = model.named_steps["vec"].transform(texts)
    if hasattr(clf, "decision_function") and not isinstance(clf, ComplementNB):
        return clf.decision_function(X)
    p = clf.predict_proba(X)[:, 1]
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


_WORD = re.compile(TOKEN_PATTERN)


def word_contributions(model: Pipeline, text: str, top: int = 8) -> dict:
    """Exact decomposition of the LR logit into word-level contributions.

    Word-n-gram features are credited to the words they contain; character
    n-grams are credited to the word(s) whose padded form contains them. The
    contributions sum (with the intercept) to the model's logit.
    """
    clf = model.named_steps["clf"]
    if not isinstance(clf, LogisticRegression):
        return {"terms": [], "intercept": 0.0, "logit": 0.0}
    union: FeatureUnion = model.named_steps["vec"]
    coef = clf.coef_[0]
    X = union.transform([text]).tocsr()
    names = _feature_names(union)
    words = _WORD.findall(text.lower())
    contrib: dict[str, float] = defaultdict(float)
    padded = [f" {w} " for w in words]
    for j, v in zip(X.indices, X.data):
        c = float(coef[j] * v)
        kind, feat = names[j]
        if kind == "word":
            parts = feat.split(" ")
            for p in parts:
                contrib[p] += c / len(parts)
        else:
            owners = [w for w, pw in zip(words, padded) if feat in pw]
            if not owners:
                contrib["<other>"] += c
                continue
            for w in set(owners):
                contrib[w] += c / len(set(owners))
    logit = float(np.asarray(X @ coef).ravel()[0] + clf.intercept_[0])
    items = [(w, c) for w, c in contrib.items() if w != "<other>"]
    items.sort(key=lambda kv: -abs(kv[1]))
    return {"terms": [{"term": w, "contribution": round(c, 4)} for w, c in items[:top]],
            "intercept": round(float(clf.intercept_[0]), 4), "logit": round(logit, 4)}


_NAME_CACHE: dict[int, list[tuple[str, str]]] = {}


def _feature_names(union: FeatureUnion) -> list[tuple[str, str]]:
    key = id(union)
    if key not in _NAME_CACHE:
        out = []
        for name, vec in union.transformer_list:
            out.extend((name, f) for f in vec.get_feature_names_out())
        _NAME_CACHE[key] = out
    return _NAME_CACHE[key]
