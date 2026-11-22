"""Human-readable explanations grounded in detected evidence.

Two kinds of evidence are kept distinct in the output:

* ``key_factors`` - the fusion model's *exact* per-feature contributions to the
  final logit (relative to an average training message). This is what the
  model actually used; it is still correlational, not causal proof.
* ``tactics`` / ``risk_signals`` / ``benign`` - rule findings shown as
  *supporting evidence* with highlighted spans.

No external language model is used; sentences are assembled from templates.
"""
from __future__ import annotations

import re

from backend.engines.fusion import FEATURE_LABELS

TACTIC_PHRASES = {
    "urgency": "pressures you to act urgently",
    "threat": "threatens consequences such as blocking, penalties or legal action",
    "authority": "invokes a bank, brand or authority while asking you to act",
    "reward": "promises an unexpected prize or reward",
    "sensitive_info": "asks for sensitive details such as an OTP, PIN or card number",
    "payment": "asks for an up-front payment or fee",
    "link": "pushes you to open a link or install an app",
    "job_investment": "offers easy income or guaranteed returns",
    "emotional": "uses emotional pressure (emergency, family or romance)",
    "secrecy": "asks you to keep the matter secret",
}
SIGNAL_PHRASES = {
    "lookalike_domain": "links to a look-alike domain",
    "brand_domain_mismatch": "links to a domain that does not belong to the brand it names",
    "shortened_link": "hides its destination behind a shortened link",
    "ip_link": "links to a raw IP address",
    "suspicious_tld": "uses an unusual domain ending",
    "punycode": "uses an internationalised (punycode) domain",
    "at_in_url": "contains a deceptive '@' inside a link",
    "obfuscation": "uses disguised characters that can evade filters",
    "messaging_app": "moves the conversation to WhatsApp or Telegram",
    "defanged_link": "writes its link in a disguised format",
}
STRENGTH_ORDER = {"strong": 0, "moderate": 1, "weak": 2}


def _join(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def confidence_interpretation(conf: float, verdict: str) -> dict:
    if conf >= 0.9:
        level = "high"
    elif conf >= 0.75:
        level = "moderately high"
    elif conf >= 0.6:
        level = "moderate"
    else:
        level = "low"
    pct = round(conf * 100)
    return {
        "level": level,
        "text": (f"{level.capitalize()} confidence. The score is calibrated on held-out validation data: "
                 f"messages that received a similar score were {verdict} roughly {pct}% of the time."),
    }


def explain(result: dict, out, contributions: list[tuple[str, float]], words: dict, threshold: float) -> dict:
    verdict = result["verdict"]
    conf = result["confidence"]
    hits = sorted(out.tactic_hits, key=lambda h: STRENGTH_ORDER[h.strength])
    sig_ids = [s.id for s in out.signals]
    rep = out.benign

    sentences: list[str] = []
    if verdict == "SCAM":
        tparts = [TACTIC_PHRASES[h.id] for h in hits[:3]]
        sparts = [SIGNAL_PHRASES[s] for s in dict.fromkeys(sig_ids) if s in SIGNAL_PHRASES][:2]
        if rep.conflict:
            sentences.append("Although it is formatted like a routine notification, it "
                             + _join(rep.conflict_reasons) + " - a common scam pattern.")
        if tparts or sparts:
            sentences.append("This message " + _join(tparts + sparts) + ".")
        else:
            sentences.append("No single explicit tactic stands out, but the wording closely resembles known scam "
                             "messages in the training data.")
        if result.get("category_label") and result["category"] != "OTHER":
            sentences.append(f"Its content matches the {result['category_label']} scam pattern.")
        sentences.append("Do not click links, call numbers or share codes from this message; contact the "
                         "organisation through its official app or website instead.")
    else:
        descr = [d for t, d in zip(rep.templates, rep.descriptions) if t != "safety_advice"]
        if descr:
            sentences.append("This message appears to be a " + descr[0][0].lower() + descr[0][1:] + ".")
        else:
            sentences.append("The wording resembles ordinary, legitimate messages.")
        if rep.safety_advice and ("otp_notification" in rep.templates or "otp_mention" in sig_ids):
            sentences.append("It carries standard safety advice and does not ask you to share the code.")
        if hits:
            sentences.append("Some cues were noticed (" + _join([h.label.lower() for h in hits[:2]])
                             + "), but the overall evidence points to a genuine message.")
        else:
            sentences.append("No manipulation tactics were detected.")
        risky = [SIGNAL_PHRASES[s] for s in dict.fromkeys(sig_ids) if s in SIGNAL_PHRASES]
        if risky:
            sentences.append("Note: it " + _join(risky[:2]) + ", so stay cautious.")
    if result["borderline"]:
        sentences.append("The evidence is mixed and the score is close to the decision threshold; treat this "
                         "verdict with caution and verify through an official channel.")

    factors = []
    for name, c in contributions:
        if abs(c) < 0.05 or len(factors) >= 6:
            continue
        factors.append({"feature": name, "label": FEATURE_LABELS.get(name, name), "contribution": round(c, 3),
                        "direction": "towards SCAM" if c > 0 else "towards SAFE"})

    return {
        "explanation": " ".join(sentences),
        "confidence_interpretation": confidence_interpretation(conf, verdict),
        "key_factors": factors,
        "semantic_terms": words.get("terms", []),
        "highlights": _highlights(out, words),
        "evidence_note": ("Key factors are the fusion model's own per-feature contributions. Highlighted tactics and "
                          "signals are rule-based supporting evidence, not a full account of the model's reasoning."),
    }


def _highlights(out, words: dict) -> list[dict]:
    cands: list[tuple[int, int, int, str, str]] = []  # start, end, priority, kind, label
    for h in out.tactic_hits:
        for e in h.evidence:
            cands.append((e.start, e.end, 0, "tactic", h.label))
    for s in out.signals:
        for e in s.evidence:
            cands.append((e.start, e.end, 1, "signal", s.label))
    for e in out.benign.evidence:
        cands.append((e.start, e.end, 2, "benign", "Genuine-message pattern"))
    text = out.pre.original
    low = text.lower()
    for t in words.get("terms", [])[:6]:
        term = t["term"]
        if t["contribution"] <= 0 or len(term) < 3 or term.startswith("x") and term.endswith("x"):
            continue
        for m in re.finditer(r"\b" + re.escape(term) + r"\b", low):
            cands.append((m.start(), m.end(), 3, "term", "Scam-associated wording (text model)"))
    cands.sort(key=lambda c: (c[2], c[0]))
    chosen: list[tuple[int, int, int, str, str]] = []
    for c in cands:
        if c[1] <= c[0]:
            continue
        if any(not (c[1] <= a[0] or c[0] >= a[1]) for a in chosen):
            continue
        chosen.append(c)
    chosen.sort()
    return [{"start": s, "end": e, "kind": k, "label": lab, "text": text[s:e]} for s, e, _, k, lab in chosen]
