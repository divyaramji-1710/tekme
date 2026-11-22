"""Scam DNA: explicit detection of manipulation tactics.

Each tactic is a set of linguistic cues (English + Hinglish + a few Devanagari
terms). A cue match is *observed textual evidence*; it is not proof of intent.
Strength is a documented, rule-based ordinal - never a fake probability:

* ``weak``     - one cue, no corroborating context
* ``moderate`` - two or more distinct cues, or one cue plus a corroborating
                 structural element (link / phone / payment detail)
* ``strong``   - moderate evidence that also co-occurs with an action request

Some tactics only *activate* with context: mentioning a bank is not
impersonation unless the message also asks the reader to act.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from backend.preprocessing.normalizer import Preprocessed, Span

F = re.IGNORECASE

NEGATION_RE = re.compile(
    r"(?:\b(?:do\s+not|don'?t|dont|never|not\s+to|no\s+one|nobody|will\s+not|won'?t|cannot|"
    r"must\s+not|should\s+not|na|mat|kabhi\s+nahi|nahi)\b|न\s|मत\s|कभी)[^.!?\n]{0,40}$", F)
NEGATION_AFTER_RE = re.compile(r"^[^.!?\n]{0,25}\b(?:na|mat|nahi)\s+(?:karein|kare|karo|karna)\b|^\s*न\s*करें", F)


@dataclass
class Tactic:
    id: str
    label: str
    description: str
    cues: list[re.Pattern]
    needs_context: bool = False  # only active with an action request / threat


def _c(*patterns: str) -> list[re.Pattern]:
    return [re.compile(p, F) for p in patterns]


ACTION_RE = re.compile(
    r"\b(?:click|tap|visit|open|login|log\s?in|sign\s?in|call|dial|contact|whatsapp|reply|send|share|"
    r"provide|submit|enter|update|verify|confirm|pay|transfer|download|install|register|apply|claim|"
    r"karein|bhejo|batao)\b", F)

TACTICS: list[Tactic] = [
    Tactic("urgency", "Urgency pressure",
           "Pushes the reader to act before thinking (deadlines, 'immediately', 'last chance').",
           _c(r"\b(?:immediately|urgent(?:ly)?|asap|right\s+now|act\s+now|hurry|at\s+the\s+earliest)\b",
              r"\bwithin\s+\d+\s*(?:hours?|hrs?|minutes?|mins?|days?)\b",
              r"\b(?:today|tonight)\s+(?:only|itself|before|by)\b|\bby\s+(?:today|tonight)\b",
              r"\b(?:last|final)\s+(?:chance|day|date|warning|reminder|notice|opportunity)\b",
              r"\b(?:expires?|expiring|expiry)\s+(?:today|tonight|soon|in\s+\d+)\b",
              r"\blimited\s+(?:time|period|slots?|offer)\b|\boffer\s+ends\b|\bbefore\s+\d{1,2}\s*(?:am|pm)\b",
              r"\b(?:turant|jaldi|aaj\s+hi|abhi\s+(?:karein|kare|update|call|click|pay))\b",
              r"\d+\s*ghante|तुरंत|जल्दी")),
    Tactic("threat", "Threat or consequence",
           "Warns of loss, blocking, penalties or legal action if the reader does not comply.",
           _c(r"\b(?:account|a/c|card|sim|number|service|connection|wallet|upi|kyc|pan|aadhaar|profile|id|power|electricity)"
              r"\b[^.!?\n]{0,40}\b(?:will\s+be|has\s+been|have\s+been|is\s+being|is|are|getting|get)\s+"
              r"(?:temporarily\s+|permanently\s+)?(?:blocked|suspended|deactivated|closed|terminated|frozen|"
              r"disconnected|restricted|locked|cancell?ed|disabled|barred|on\s+hold|cut)\b",
              r"\b(?:block|suspend|band|deactivate|disconnect|kat|cut)\s+(?:ho\s+)?(?:jayega|jayegi|hoga|kar\s+diya\s+jayega)\b",
              r"\blegal\s+action\b|\barrest(?:ed)?\b|\bwarrant\b|\bfir\b|\bcourt\b|\bcyber\s*crime\b|\bdigital\s+arrest\b",
              r"\b(?:penalty|fine|jurmana|late\s+fee)\b[^.!?\n]{0,30}\b(?:will|be|imposed|charged|lagega|lagegi)\b",
              r"\b(?:avoid|to\s+prevent)\s+(?:suspension|blocking|deactivation|disconnection|penalty|legal|closure)\b",
              r"\b(?:otherwise|failing\s+which|or\s+else|nahi\s+toh|varna|warna)\b",
              r"बंद\s+(?:हो|कर)|कट\s+जाएगा")),
    Tactic("authority", "Authority / brand impersonation",
           "Claims to be a bank, regulator, government body, police or well-known company AND asks the reader to act.",
           _c(r"\b(?:rbi|reserve\s+bank|sbi|state\s+bank|hdfc|icici|axis\s+bank|kotak|pnb|bank\s+of\s+baroda|canara|"
              r"union\s+bank|yes\s+bank|indusind|idfc|bank)\b",
              r"\b(?:income\s*tax|it\s+department|gst|customs|police|cbi|narcotics|cyber\s+cell|trai|uidai|"
              r"npci|epfo|government|govt|ministry|court|irs|hmrc)\b",
              r"\b(?:amazon|flipkart|paytm|phonepe|google\s+pay|gpay|netflix|whatsapp|fedex|dhl|blue\s*dart|"
              r"india\s+post|delhivery|airtel|jio|vodafone|bsnl|electricity\s+board|bescom|msedcl|tata\s+power)\b",
              r"\b(?:customer\s+care|helpdesk|support\s+team|official|department|security\s+team|fraud\s+team)\b"),
           needs_context=True),
    Tactic("reward", "Financial reward promise",
           "Promises prizes, winnings, cashback or gifts the reader did not ask for.",
           _c(r"\b(?:you\s+(?:have\s+)?won|you\s+are\s+(?:the\s+)?(?:lucky\s+)?winner|winner|won\s+(?:a|an|the|rs|₹|\$|£))\b",
              r"\b(?:lottery|lucky\s+draw|jackpot|sweepstake|prize|kbc|kaun\s+banega)\b",
              r"\bcongratulations?\b|\bcongrats\b|\bbadhai\b",
              r"\b(?:selected|chosen|shortlisted)\s+(?:for|to\s+receive|as)\b",
              r"\b(?:free|complimentary)\s+(?:gift|iphone|phone|recharge|voucher|cash)\b",
              r"\b(?:claim|redeem|collect)\s+(?:your|the|now|it|karein)\b",
              r"\b(?:inaam|jeeta|puraskar)\b|इनाम|लॉटरी|जीत")),
    Tactic("sensitive_info", "Request for sensitive information",
           "Asks the reader to reveal or enter OTPs, PINs, passwords, card or identity details.",
           _c(r"\b(?:share|send|provide|give|tell|enter|confirm|submit|reply\s+with|forward|batao|bhejo|bata\s+do|de\s+do|share\s+karein|read\s+out)\b"
              r"[^.!?\n]{0,40}\b(?:otp|one[\s-]time\s+password|pin|mpin|upi\s+pin|cvv|password|passcode|card\s+(?:number|details|no)|"
              r"bank\s+details|account\s+(?:number|details)|net\s*banking|login\s+details|credentials|aadhaar|pan(?:\s+card)?|"
              r"security\s+code|verification\s+code|code|expiry|date\s+of\s+birth|dob)\b",
              r"\b(?:otp|pin|cvv|password|code)\b[^.!?\n]{0,30}\b(?:to|with)\s+(?:our|the|this|my)\s+"
              r"(?:agent|executive|officer|representative|number|team|delivery\s+(?:boy|agent))\b",
              r"\b(?:otp|pin|cvv)\s+(?:batao|bhejo|share\s+karein|bata\s+do|de\s+do)\b")),
    Tactic("payment", "Suspicious payment request",
           "Asks for money up-front: fees, deposits, 'processing charges', UPI collect / QR approvals.",
           _c(r"\b(?:processing|registration|activation|clearance|customs|delivery|verification|release|handling|"
              r"service|security|refundable|token|insurance)\s+(?:fee|fees|charge|charges|amount|deposit)\b",
              r"\b(?:pay|transfer|deposit|send)\s+(?:only\s+)?(?:rs\.?|₹|inr|\$|£|the\s+fee|a\s+fee|money|amount|\d)",
              r"\b(?:scan\s+(?:the\s+)?qr|approve\s+(?:the\s+)?(?:collect|payment|request)|accept\s+(?:the\s+)?collect)\b",
              r"\b(?:advance|upfront)\s+(?:payment|fee|amount)\b|\bpay\s+(?:karein|karo|kare)\b",
              r"\b(?:shulk|fee)\s+(?:jama|bhejo|pay)\b|शुल्क|भुगतान\s+करें")),
    Tactic("link", "Pushes an external link",
           "Directs the reader to click, tap or open a link or download an app.",
           _c(r"\b(?:click|tap|visit|open|go\s+to|follow|check)\s+(?:on\s+)?(?:the\s+|this\s+|below\s+|here|link|now|karein)",
              r"\b(?:login|log\s+in|sign\s+in)\s+(?:at|on|via|here|to)\b",
              r"\b(?:download|install)\s+(?:the\s+|this\s+|our\s+)?(?:app|apk|application|file)\b|\.apk\b",
              r"\blink\s+(?:below|here|par|pe)\b|\bclick\s+karein\b|लिंक|क्लिक")),
    Tactic("job_investment", "Fake job / investment lure",
           "Offers easy income, part-time tasks, guaranteed returns or trading tips.",
           _c(r"\bpart[\s-]?time\b|\bwork\s+from\s+home\b|\bghar\s+(?:baithe|se)\b|\bonline\s+job\b",
              r"\bearn\b[^.!?\n]{0,30}\b(?:per\s+day|daily|a\s+day|per\s+hour|weekly|per\s+week|monthly)\b",
              r"\b(?:daily|weekly)\s+(?:income|earning|salary|payout|profit)\b",
              r"\b(?:guaranteed|assured|fixed|high|double)\s+(?:returns?|profit|income|money)\b|\bdouble\s+your\b",
              r"\b(?:investment|invest|trading|crypto|bitcoin|usdt|forex|stock\s+tips?|ipo)\b[^.!?\n]{0,40}\b(?:profit|returns?|earn|guaranteed|group|plan)\b",
              r"\b(?:like|subscribe|rate|review)\s+(?:videos?|products?|hotels?|youtube)\b|\b(?:simple|easy)\s+tasks?\b",
              r"\b(?:hiring|vacancy|vacancies|recruiting|recruitment)\b[^.!?\n]{0,40}\b(?:salary|earn|whatsapp|telegram|no\s+interview|no\s+experience|immediate)\b",
              r"\b(?:kamao|kamaayein)\b|\bnaukri\b[^.!?\n]{0,30}\b(?:fee|shulk|whatsapp|telegram)\b|कमाएं|कमाई")),
    Tactic("emotional", "Emotional manipulation",
           "Uses fear, sympathy, family emergencies or romance to lower the reader's guard.",
           _c(r"\b(?:hi|hello|hey)\s+(?:mum|mom|mummy|dad|papa|maa)\b|\bthis\s+is\s+my\s+new\s+number\b|\bnew\s+(?:number|phone)\b[^.!?\n]{0,20}\b(?:mum|mom|dad|save)\b",
              r"\b(?:accident|hospital|emergency|in\s+trouble|stranded|lost\s+my\s+(?:phone|wallet))\b",
              r"\b(?:please\s+help|help\s+me|i\s+need\s+(?:your\s+)?help|need\s+money)\b",
              r"\b(?:my\s+love|darling|sweetheart|my\s+dear|honey)\b",
              r"\b(?:your\s+(?:son|daughter|child))\b[^.!?\n]{0,30}\b(?:arrested|accident|custody|trouble)\b")),
    Tactic("secrecy", "Secrecy or isolation",
           "Asks the reader to keep the matter secret or not to consult the bank, family or police.",
           _c(r"\b(?:don'?t|do\s+not|never)\s+(?:tell|inform|discuss\s+(?:this\s+)?with|contact|call|visit)\s+"
              r"(?:anyone|anybody|your\s+(?:family|bank|friends|parents)|the\s+(?:bank|police|branch)|others)\b",
              r"\bkeep\s+(?:this|it)\s+(?:a\s+)?(?:secret|confidential|private|between\s+us)\b",
              r"\b(?:strictly\s+)?confidential\b|\bbetween\s+(?:us|you\s+and\s+me)\b",
              r"\b(?:kisi\s+ko\s+(?:mat|na)\s+batana|kisi\s+ko\s+mat\s+batao)\b")),
]
TACTIC_IDS = [t.id for t in TACTICS]


@dataclass
class TacticHit:
    id: str
    label: str
    description: str
    strength: str
    evidence: list[Span] = field(default_factory=list)
    rationale: str = ""

    def as_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "description": self.description,
                "strength": self.strength, "rationale": self.rationale,
                "evidence": [e.as_dict() for e in self.evidence]}


def _negated(text: str, start: int, end: int) -> bool:
    before = text[max(0, start - 45):start]
    after = text[end:end + 30]
    return bool(NEGATION_RE.search(before) or NEGATION_AFTER_RE.search(after))


def detect(pre: Preprocessed) -> list[TacticHit]:
    text = pre.normalized
    has_action = bool(ACTION_RE.search(text))
    has_url = bool(pre.urls or pre.placeholders.get("url"))
    structural = bool(pre.urls or pre.phones or pre.upi_ids or pre.emails
                      or pre.placeholders.get("url") or pre.placeholders.get("phone"))
    hits: list[TacticHit] = []
    for t in TACTICS:
        spans: list[tuple[int, int]] = []
        distinct = 0
        for ci, cue in enumerate(t.cues):
            if t.id == "link" and ci == 1 and not has_url:
                continue  # "login to NetBanking" without a link is not pushing a link
            found = False
            for m in cue.finditer(text):
                s, e = m.span()
                if t.id in ("sensitive_info", "payment", "link") and _negated(text, s, e):
                    continue
                if any(not (e <= a or s >= b) for a, b in spans):
                    continue
                spans.append((s, e))
                found = True
            distinct += found
        if spans:
            hits.append(_score(t, pre, spans, distinct, has_action, structural))
    # context-dependent tactics
    active_ids = {h.id for h in hits}
    out = []
    for h in hits:
        if h.id == "authority":
            pressure = active_ids & {"threat", "sensitive_info", "payment", "link", "urgency"}
            if not pressure:
                continue  # mere mention of an organisation is not impersonation
            h.rationale = ("Mentions an institution or brand together with "
                           + ", ".join(sorted(pressure)).replace("_", " ")
                           + "; genuine institutions rarely combine these in one SMS.")
        out.append(h)
    return out


def _score(t: Tactic, pre: Preprocessed, spans, distinct: int, has_action: bool, structural: bool) -> TacticHit:
    if distinct >= 2 or (distinct == 1 and structural):
        strength = "moderate"
        if has_action and (distinct >= 2 and structural):
            strength = "strong"
    else:
        strength = "weak"
    evidence = [pre.span(s, e) for s, e in sorted(spans)][:5]
    rationale = f"{len(spans)} cue(s) from {distinct} distinct pattern group(s)"
    if structural:
        rationale += ", alongside a link/phone/payment identifier"
    return TacticHit(t.id, t.label, t.description, strength, evidence, rationale + ".")


def features(hits: list[TacticHit]) -> dict[str, float]:
    """Numeric features for the fusion model (one ordinal per tactic + totals)."""
    level = {"weak": 1.0, "moderate": 2.0, "strong": 3.0}
    f = {f"tactic_{tid}": 0.0 for tid in TACTIC_IDS}
    for h in hits:
        f[f"tactic_{h.id}"] = level[h.strength]
    f["tactic_count"] = float(len(hits))
    f["tactic_strong_count"] = float(sum(h.strength == "strong" for h in hits))
    return f
