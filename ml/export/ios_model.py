"""Compact classifier for the iOS Message Filter extension, plus its reference implementation.

Why a separate model: an app extension has tight memory limits and the full TEKMĒ engine (141k-term index,
three text models, rule engines) is a lot to port to Swift without a Mac to test on. This compact model uses a
preprocessing pipeline small enough to be written identically in Swift (ios/Shared/TekmeClassifier.swift):

    remove invisible chars -> map look-alike letters -> NFKC -> mask links / UPI / e-mail / phones / long numbers
    -> lowercase -> tokens [letters, numbers, _]+ -> add rule tokens -> word 1-2 gram TF-IDF -> logistic regression
    -> Platt calibration

It is trained on the TRAINING split (+ train-only augmentation), C and the junk threshold are chosen on
VALIDATION, and it is measured once on test, Test B and the adversarial set. Because a filter that hides genuine
messages is harmful, the junk threshold is the lowest one whose validation false-positive rate is <= 1%.

Outputs: ios/Shared/tekme_compact.json, ios/Tests/Fixtures/expected.json, reports/ios_compact_report.json
Usage:   python -m ml.export.ios_model
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score

from backend.core.config import BACKEND_DATA, ROOT
from backend.preprocessing.obfuscation import CONFUSABLES, INVISIBLE

DATA = ROOT / "ml" / "datasets" / "processed"
OUT = ROOT / "ios" / "Shared" / "tekme_compact.json"
FIX = ROOT / "ios" / "Tests" / "Fixtures" / "expected.json"
REPORT = ROOT / "reports" / "ios_compact_report.json"

# ASCII-explicit patterns so Python `re` and ICU (NSRegularExpression) behave the same.
NB = r"(?<![A-Za-z0-9_])"   # left boundary
NA = r"(?![A-Za-z0-9_])"    # right boundary
TLDS = "com|in|net|org|info|biz|io|co|ly|gl|gd|cc|xyz|top|club|online|site|live|link|app|shop|store|me|tk|ml|ga|cf|gq|icu|vip|win|loan|work|click|support|services|money|bank|pro|ru|cn|uk|us"
PATTERNS = [
    ("xurlx", r"(?:https?|hxxps?)://[^\s]+|www\.[^\s]+|" + NB + r"[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.(?:" + TLDS + r")" + NA + r"(?:/[^\s]*)?"),
    ("xupix", NB + r"[A-Za-z0-9._-]{2,}@(?:ok[a-z]+|ybl|ibl|axl|paytm|upi|apl|yapl|icici|sbi|hdfcbank|axisbank|kotak|fbl|freecharge|airtel|jio)" + NA),
    ("xemailx", NB + r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}" + NA),
    ("xphonex", r"(?<![0-9])(?:\+[0-9]{1,3}[ -]?)?[0-9]{5}[ -]?[0-9]{5}(?![0-9])|(?<![0-9])1[ -]?8[06]0[ -]?[0-9]{3}[ -]?[0-9]{4}(?![0-9])"),
    ("xnumx", r"[0-9]{4,}"),
]
RULES = [
    ("zzotpcode", r"(?:otp|one time password|verification code|code)[^.!?\n]{0,25}xnumx|xnumx[^.!?\n]{0,25}(?:otp|one time password|verification code)"),
    ("zzsharecode", r"(?:share|send|forward|tell|give|batao|bhejo)[^.!?\n]{0,30}(?:otp|code|pin|cvv|password)|(?:otp|code|pin|cvv)[^.!?\n]{0,30}(?:with|to) (?:our|the|this|my) (?:agent|executive|officer|team|number)"),
    ("zznevershare", r"(?:do not|don't|dont|never)[^.!?\n]{0,15}(?:share|disclose)|share (?:na|mat) (?:karein|kare|karo)"),
    ("zzurgent", r"(?:immediately|urgent|within [0-9]+ ?(?:hours?|hrs?|minutes?)|today|turant|jaldi|abhi)"),
    ("zzblock", r"(?:blocked|suspended|deactivated|band ho|block ho|frozen|closed)"),
    ("zzprize", r"(?:won|winner|lottery|lucky draw|prize|congratulations|inaam|jeeta)"),
    ("zzfee", r"(?:processing|registration|activation|release|clearance) (?:fee|charge)|pay (?:rs|inr|only)"),
]
TOKEN = re.compile(r"[^\W]+")  # == [\p{L}\p{N}_]+ (Python \w is letters, numbers and underscore)


def compact_text(raw: str) -> str:
    t = "".join(ch for ch in raw if ch not in INVISIBLE)
    t = "".join(CONFUSABLES.get(ch, ch) for ch in t)
    t = unicodedata.normalize("NFKC", t)
    for tag, pat in PATTERNS:
        t = re.sub(pat, f" {tag} ", t, flags=re.IGNORECASE)
    t = t.lower()
    toks = TOKEN.findall(t)
    flat = " ".join(toks)
    extra = [tag for tag, pat in RULES if re.search(pat, flat)]
    return " ".join(toks + extra)


def main() -> int:
    d = pd.read_parquet(DATA / "dataset.parquet")
    aug = pd.read_parquet(DATA / "train_augmented.parquet")
    tr = pd.concat([d[d.split == "train"], aug], ignore_index=True)
    va, te = d[d.split == "val"], d[d.split == "test"]
    tb = pd.read_parquet(DATA / "test_b.parquet")
    adv = pd.read_parquet(DATA / "adversarial_test.parquet")
    X = {k: [compact_text(t) for t in df.text] for k, df in (("tr", tr), ("va", va), ("te", te), ("tb", tb), ("adv", adv))}
    y = {k: (df.binary_label == "SCAM").astype(int).values for k, df in (("tr", tr), ("va", va), ("te", te), ("tb", tb), ("adv", adv))}

    vec = TfidfVectorizer(token_pattern=r"(?u)\b\w+\b", ngram_range=(1, 2), min_df=3, max_features=6000, sublinear_tf=True, lowercase=False)
    Xtr = vec.fit_transform(X["tr"])
    Xva = vec.transform(X["va"])
    best = None
    for C in (0.5, 1, 2, 4, 8):
        clf = LogisticRegression(C=C, class_weight="balanced", max_iter=4000).fit(Xtr, y["tr"])
        auc = roc_auc_score(y["va"], clf.decision_function(Xva))
        if not best or auc > best[0]:
            best = (auc, C, clf)
    _, C, clf = best
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(clf.decision_function(Xva).reshape(-1, 1), y["va"])
    a, b = float(platt.coef_[0, 0]), float(platt.intercept_[0])
    prob = lambda texts: 1 / (1 + np.exp(-(a * clf.decision_function(vec.transform(texts)) + b)))  # noqa: E731
    p_va = prob(X["va"])
    safe_va = y["va"] == 0
    threshold = 0.5
    for t in np.round(np.arange(0.5, 0.991, 0.01), 2):
        if ((p_va >= t) & safe_va).sum() / safe_va.sum() <= 0.01:
            threshold = float(t)
            break

    def measure(key: str, t: float) -> dict:
        p = prob(X[key])
        pred = (p >= t).astype(int)
        yy = y[key]
        return {"n": int(len(yy)), "accuracy": round(float((pred == yy).mean()), 4), "precision": round(float(precision_score(yy, pred, zero_division=0)), 4),
                "recall": round(float(recall_score(yy, pred, zero_division=0)), 4), "f1": round(float(f1_score(yy, pred, zero_division=0)), 4),
                "false_positive_rate": round(float(((pred == 1) & (yy == 0)).sum() / max(1, (yy == 0).sum())), 4),
                "roc_auc": round(float(roc_auc_score(yy, p)), 4)}

    report = {"model": "compact word 1-2 gram TF-IDF + logistic regression + Platt", "C": C, "n_features": len(vec.vocabulary_),
              "junk_threshold": threshold, "threshold_rule": "lowest threshold with validation FPR <= 1%",
              "at_junk_threshold": {k: measure(k, threshold) for k in ("va", "te", "tb", "adv")},
              "at_0.5": {k: measure(k, 0.5) for k in ("te", "tb")},
              "note": "Measured in Python with the reference implementation. The Swift port has NOT been compiled or run."}
    terms = [None] * len(vec.vocabulary_)
    for t, j in vec.vocabulary_.items():
        terms[j] = t
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "format": "tekme-compact/1", "terms": terms, "idf": [round(float(v), 6) for v in vec.idf_],
        "coef": [round(float(v), 6) for v in clf.coef_[0]], "intercept": float(clf.intercept_[0]), "platt_a": a, "platt_b": b,
        "junk_threshold": threshold, "patterns": [[t, p] for t, p in PATTERNS], "rules": [[t, p] for t, p in RULES],
        "invisible": sorted(INVISIBLE), "confusables": CONFUSABLES,
    }, ensure_ascii=False), encoding="utf-8")
    # Fixtures: demo examples and hand-written edge cases only (no dataset text is shipped with the iOS project).
    from ml.export.parity import EDGE_CASES
    ex = [e["text"] for e in json.loads((BACKEND_DATA / "examples.json").read_text(encoding="utf-8"))["examples"]]
    texts = ex + [t for t in EDGE_CASES if "fedex" not in t.lower()]
    FIX.parent.mkdir(parents=True, exist_ok=True)
    fx = []
    for t in texts:
        ct = compact_text(t)
        pt = float(prob([ct])[0])  # the model scores the COMPACTED text, as the Swift code does
        fx.append({"text": t, "compact_text": ct, "probability": round(pt, 6), "junk": bool(pt >= threshold)})
    FIX.write_text(json.dumps(fx, ensure_ascii=False, indent=1), encoding="utf-8")
    REPORT.write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps(report, indent=1))
    print(f"model json {OUT.stat().st_size / 1e3:.0f} kB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
