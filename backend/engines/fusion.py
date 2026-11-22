"""Calibrated decision fusion.

A standardised logistic-regression meta-classifier combines the semantic score
with the rule engines. It is trained on *out-of-fold* semantic scores (never
in-sample) and calibrated afterwards on the validation split.

Because the meta-model is linear on standardised inputs, each feature's
contribution to the final logit is exactly ``coef * (x - mean) / scale``; the
explainer reports these values.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from backend.engines.tactics import TACTIC_IDS

SEMANTIC = ["sem_logit"]
TACTICS = [f"tactic_{t}" for t in TACTIC_IDS] + ["tactic_count", "tactic_strong_count"]
TRUST = ["has_url", "url_shortener", "url_ip", "url_suspicious_tld", "url_lookalike", "url_official",
         "url_risky_structure", "brand_domain_mismatch", "brand_mentioned", "has_phone", "call_request",
         "messaging_app", "has_email", "has_upi", "has_money", "large_amount", "otp_mention", "pin_mention",
         "suspension_word", "caps_ratio", "exclamations", "obfuscation_total", "log_length"]
BENIGN = ["benign_otp_notification", "benign_safety_advice", "benign_transaction_alert", "benign_delivery_update",
          "benign_reminder", "benign_personal_chat", "benign_template_count", "benign_conflict",
          "otp_share_request", "spec_logit", "spec_applicable"]

GROUPS = {"semantic": SEMANTIC, "tactics": TACTICS, "trust": TRUST, "benign": BENIGN}
ABLATIONS = {
    "A_semantic_only": ["semantic"],
    "B_semantic+tactics": ["semantic", "tactics"],
    "C_semantic+trust": ["semantic", "trust"],
    "D_semantic+benign": ["semantic", "benign"],
    "E_full_hybrid": ["semantic", "tactics", "trust", "benign"],
}

FEATURE_LABELS = {
    "sem_logit": "Language of the message (semantic text model)",
    "spec_logit": "Transactional-message specialist model",
    "spec_applicable": "Message looks transactional",
    **{f"tactic_{t}": f"Tactic: {t.replace('_', ' ')}" for t in TACTIC_IDS},
    "tactic_count": "Number of manipulation tactics", "tactic_strong_count": "Number of strong tactics",
    "has_url": "Contains a link", "url_count": "Number of links", "url_shortener": "Shortened link",
    "url_ip": "Link to raw IP address", "url_suspicious_tld": "Unusual domain ending",
    "url_lookalike": "Look-alike domain", "url_official": "Known official domain",
    "url_risky_structure": "Risky link structure", "brand_domain_mismatch": "Brand / link mismatch",
    "brand_mentioned": "Mentions a known brand", "has_phone": "Contains a phone number",
    "call_request": "Asks you to call a number", "messaging_app": "Moves to WhatsApp / Telegram",
    "has_email": "Contains an e-mail address", "has_upi": "Contains a UPI ID", "has_money": "Mentions money",
    "large_amount": "Large sum of money", "otp_mention": "Mentions an OTP / code", "pin_mention": "Mentions PIN / password",
    "suspension_word": "Blocking / suspension wording", "caps_ratio": "Share of capital letters",
    "exclamations": "Exclamation marks", "obfuscation_total": "Disguised characters", "log_length": "Message length",
    "benign_otp_notification": "Routine OTP notification shape", "benign_safety_advice": "Contains safety advice",
    "benign_transaction_alert": "Transaction-alert shape", "benign_delivery_update": "Delivery-update shape",
    "benign_reminder": "Reminder shape", "benign_personal_chat": "Personal-chat shape",
    "benign_template_count": "Number of genuine-message patterns", "benign_conflict": "Genuine shell + malicious instruction",
    "otp_share_request": "Asks to share OTP / PIN",
}


def feature_names(groups: list[str]) -> list[str]:
    return [f for g in groups for f in GROUPS[g]]


def matrix(rows: list[dict], names: list[str]) -> np.ndarray:
    return np.array([[float(r.get(n, 0.0)) for n in names] for r in rows], dtype=float)


@dataclass
class Calibrator:
    method: str  # "sigmoid" | "isotonic"
    a: float = 1.0
    b: float = 0.0
    iso: IsotonicRegression | None = None

    @classmethod
    def fit(cls, scores: np.ndarray, y: np.ndarray, method: str) -> "Calibrator":
        if method == "sigmoid":
            lr = LogisticRegression(C=1e6, max_iter=1000).fit(scores.reshape(-1, 1), y)
            return cls("sigmoid", float(lr.coef_[0, 0]), float(lr.intercept_[0]))
        iso = IsotonicRegression(out_of_bounds="clip", y_min=1e-4, y_max=1 - 1e-4).fit(scores, y)
        return cls("isotonic", iso=iso)

    def __call__(self, scores: np.ndarray) -> np.ndarray:
        scores = np.asarray(scores, dtype=float)
        if self.method == "sigmoid":
            return 1.0 / (1.0 + np.exp(-(self.a * scores + self.b)))
        return self.iso.predict(scores)


@dataclass
class FusionModel:
    groups: list[str]
    names: list[str]
    scaler: StandardScaler
    clf: LogisticRegression
    calibrator: Calibrator | None = None

    @classmethod
    def fit(cls, rows: list[dict], y: np.ndarray, groups: list[str], C: float = 1.0) -> "FusionModel":
        names = feature_names(groups)
        X = matrix(rows, names)
        scaler = StandardScaler().fit(X)
        clf = LogisticRegression(C=C, class_weight="balanced", max_iter=5000).fit(scaler.transform(X), y)
        return cls(groups, names, scaler, clf)

    def logit(self, rows: list[dict]) -> np.ndarray:
        return self.clf.decision_function(self.scaler.transform(matrix(rows, self.names)))

    def proba(self, rows: list[dict]) -> np.ndarray:
        z = self.logit(rows)
        if self.calibrator is None:
            return 1.0 / (1.0 + np.exp(-z))
        return self.calibrator(z)

    def contributions(self, row: dict) -> list[tuple[str, float]]:
        x = matrix([row], self.names)[0]
        zx = (x - self.scaler.mean_) / np.where(self.scaler.scale_ == 0, 1.0, self.scaler.scale_)
        c = self.clf.coef_[0] * zx
        return sorted(zip(self.names, c.tolist()), key=lambda kv: -abs(kv[1]))


def expected_calibration_error(p: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    """ECE over the probability of the positive class with equal-width bins."""
    p = np.asarray(p)
    y = np.asarray(y)
    edges = np.linspace(0, 1, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & ((p < hi) if hi < 1 else (p <= hi))
        if m.any():
            ece += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(ece)
