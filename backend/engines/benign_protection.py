"""Legitimate-message protection.

Two parts:

1. **Template evidence (rules, here).** Recognises the shape of genuine
   OTP notifications, transaction alerts, delivery updates, reminders and
   personal chat, plus safety advice such as "do not share it with anyone".
2. **Hard-negative specialist (learned, see ml/training/train.py).** A
   classifier trained only on *transactional-looking* messages (genuine service
   SMS vs. scams that imitate them), whose score enters the fusion model.

Crucially, benign evidence never overrides malicious instructions: if a
message looks like an OTP alert *and* asks for the OTP to be sent to an agent,
the ``conflict`` flag is raised and pushes towards SCAM.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from backend.engines.tactics import TacticHit
from backend.preprocessing.normalizer import Preprocessed, Span

F = re.IGNORECASE

TEMPLATES = {
    "otp_notification": (
        "Routine one-time-password / verification-code notification",
        [re.compile(p, F) for p in (
            r"\b(?:otp|one[\s-]time\s+password|verification\s+code|security\s+code|login\s+code|code)\b[^.!?\n]{0,25}\b(?:is|:|for)\b",
            r"\b(?:is|as)\s+(?:your|the)\s+(?:otp|one[\s-]time\s+password|verification\s+code|code|pin)\b",
            r"\buse\s+(?:otp|code|pin)\b|\bvalid\s+(?:for|till|upto|up\s+to)\b",
        )]),
    "safety_advice": (
        "Contains standard safety advice (do not share / we never ask)",
        [re.compile(p, F) for p in (
            r"\b(?:do\s+not|don'?t|never)\s+(?:share|disclose|reveal|give)\b",
            r"\b(?:will\s+never|never)\s+(?:ask|call|request)\b|\bnever\s+asks?\s+for\b",
            r"\bshare\s+(?:na|mat)\s+(?:karein|kare|karo)\b|\bkisi\s+(?:ke\s+saath|ko)\b[^.!?\n]{0,25}\b(?:na|mat)\b",
            r"\bif\s+(?:not|this\s+was\s+not|this\s+wasn'?t)\s+(?:you|done\s+by\s+you|requested)\b",
            r"साझा\s+न\s+करें|शेयर\s+न\s+करें",
        )]),
    "transaction_alert": (
        "Looks like a bank / wallet transaction alert",
        [re.compile(p, F) for p in (
            r"\b(?:debited|credited|spent|withdrawn|received|paid|sent|transferred|deducted|refunded)\b",
            r"\b(?:a/c|account|acct|card|upi|wallet)\b[^.!?\n]{0,25}(?:xx|\*\*|x{2,}|ending|no\.?)\s*\w*\d{2,}",
            r"\b(?:avl|available|avail\.?)\s*(?:bal|balance)\b|\bref(?:erence)?\s*(?:no\.?|#|:)|\btxn\b|\btransaction\s+id\b|\butr\b",
        )]),
    "delivery_update": (
        "Looks like an order / delivery status update",
        [re.compile(p, F) for p in (
            r"\b(?:order|parcel|package|shipment|consignment|delivery|courier)\b",
            r"\b(?:shipped|dispatched|delivered|out\s+for\s+delivery|arriving|on\s+the\s+way|picked\s+up|in\s+transit|will\s+be\s+delivered|has\s+arrived|deliver\s+ho)\b",
        )]),
    "reminder": (
        "Looks like an appointment / bill / class reminder",
        [re.compile(p, F) for p in (
            r"\b(?:appointment|reminder|scheduled|booking|booked|confirmed|class|meeting|session|exam|due\s+date|renewal)\b",
            r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\btomorrow\b",
        )]),
}
CHAT_RE = re.compile(
    r"\b(?:i'?m|i\s+am|i'?ll|we|lol|haha|ok(?:ay)?|ya|yeah|bhai|yaar|dude|see\s+you|reached|coming|"
    r"home|dinner|lunch|tonight|love\s+you|miss\s+you|call\s+you|sorry|thanks|thank\s+you|kya|kab|kaha)\b", F)
OTP_WORD = re.compile(r"\b(?:otp|code|pin|password|cvv)\b", F)
OTP_SHARE_RE = re.compile(
    r"\b(?:share|send|forward|give|tell|provide|reply|batao|bhejo)\b[^.!?\n]{0,30}\b(?:otp|code|pin|cvv|password)\b"
    r"|\b(?:otp|code|pin|cvv|password)\b[^.!?\n]{0,30}\b(?:to|with)\s+(?:our|the|this|my|an?)\s+"
    r"(?:agent|executive|officer|representative|team|number|person|caller)\b", F)
NEG_BEFORE = re.compile(r"\b(?:do\s+not|don'?t|never|not|no\s+one|na|mat)\b[^.!?\n]{0,25}$", F)
# Benign advice that names a legitimate counter-party ("share only with the delivery partner")
SANCTIONED_SHARE = re.compile(r"\bonly\s+(?:with|to)\s+(?:the\s+)?(?:delivery|driver|rider|captain|partner|agent\s+at\s+your\s+door)|"
                              r"\bshare\s+(?:it\s+)?with\s+(?:the\s+)?(?:delivery\s+partner|driver|rider|captain)\b", F)


@dataclass
class BenignReport:
    templates: list[str] = field(default_factory=list)
    descriptions: list[str] = field(default_factory=list)
    safety_advice: bool = False
    personal_chat: bool = False
    conflict: bool = False
    conflict_reasons: list[str] = field(default_factory=list)
    evidence: list[Span] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"templates": self.templates, "descriptions": self.descriptions,
                "safety_advice": self.safety_advice, "personal_chat": self.personal_chat,
                "conflict": self.conflict, "conflict_reasons": self.conflict_reasons,
                "evidence": [e.as_dict() for e in self.evidence]}


def _otp_share_request(text: str) -> re.Match | None:
    for m in OTP_SHARE_RE.finditer(text):
        before = text[max(0, m.start() - 35):m.start()]
        if NEG_BEFORE.search(before) or NEG_BEFORE.search(m.group(0)[:20]):
            continue
        if SANCTIONED_SHARE.search(text[m.start():m.end() + 50]):
            continue
        return m
    return None


def analyse(pre: Preprocessed, tactic_hits: list[TacticHit], trust_feats: dict[str, float]) -> tuple[BenignReport, dict[str, float]]:
    text = pre.normalized
    rep = BenignReport()
    codes_present = bool(pre.codes) or pre.placeholders.get("number", 0) > 0
    for tid, (desc, pats) in TEMPLATES.items():
        matches = [m for p in pats for m in p.finditer(text)]
        groups = sum(1 for p in pats if p.search(text))
        ok = False
        if tid == "otp_notification":
            ok = groups >= 1 and codes_present and bool(OTP_WORD.search(text))
        elif tid == "safety_advice":
            ok = groups >= 1
        elif tid == "transaction_alert":
            ok = groups >= 2 or (groups >= 1 and bool(pre.amounts))
        elif tid == "delivery_update":
            ok = groups >= 2
        elif tid == "reminder":
            ok = groups >= 2
        if ok:
            if tid == "safety_advice":
                rep.safety_advice = True
            rep.templates.append(tid)
            rep.descriptions.append(desc)
            rep.evidence.extend(pre.span(*m.span()) for m in matches[:2])

    no_struct = not (trust_feats["has_url"] or trust_feats["has_phone"] or trust_feats["has_money"]
                     or trust_feats["brand_mentioned"] or trust_feats["has_upi"])
    if no_struct and len(pre.original) <= 200 and CHAT_RE.search(text) and not tactic_hits:
        rep.personal_chat = True
        rep.templates.append("personal_chat")
        rep.descriptions.append("Reads like an ordinary personal conversation")

    # Conflicts: benign-looking shell + malicious instruction
    active = {h.id: h for h in tactic_hits}
    share = _otp_share_request(text)
    service_shell = any(t in rep.templates for t in ("otp_notification", "transaction_alert", "delivery_update", "safety_advice"))
    if share:
        rep.conflict_reasons.append("asks for an OTP/PIN/code to be shared with someone")
        rep.evidence.append(pre.span(*share.span()))
    if service_shell and "sensitive_info" in active:
        rep.conflict_reasons.append("routine-looking notification that also requests sensitive details")
    if service_shell and "payment" in active:
        rep.conflict_reasons.append("routine-looking notification that also demands a payment")
    if service_shell and "threat" in active and (trust_feats["url_lookalike"] or trust_feats["brand_domain_mismatch"]
                                                 or trust_feats["url_shortener"] or trust_feats["url_suspicious_tld"]):
        rep.conflict_reasons.append("threatening notification pointing to an unofficial link")
    rep.conflict = bool(rep.conflict_reasons)

    feats = {
        "benign_otp_notification": float("otp_notification" in rep.templates),
        "benign_safety_advice": float(rep.safety_advice),
        "benign_transaction_alert": float("transaction_alert" in rep.templates),
        "benign_delivery_update": float("delivery_update" in rep.templates),
        "benign_reminder": float("reminder" in rep.templates),
        "benign_personal_chat": float(rep.personal_chat),
        "benign_template_count": float(len([t for t in rep.templates if t != "safety_advice"])),
        "benign_conflict": float(rep.conflict),
        "otp_share_request": float(share is not None),
    }
    return rep, feats
