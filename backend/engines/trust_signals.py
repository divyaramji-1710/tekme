"""Trust & risk signals from message structure. Strictly offline.

No URL is ever visited, resolved, looked up in WHOIS or checked against a cloud
reputation service; all checks are lexical, using a local brand/domain list
(``backend/data/official_domains.json``). The absence of a risky signal is
never treated as evidence that a message is safe.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from functools import lru_cache
from urllib.parse import urlsplit

from backend.core.config import BACKEND_DATA
from backend.preprocessing.normalizer import Preprocessed, Span
from backend.preprocessing.patterns import SHORTENERS, SUSPICIOUS_TLDS, TWO_LEVEL_SUFFIXES

F = re.IGNORECASE
_DELEET = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s"})


@dataclass
class Signal:
    id: str
    label: str
    severity: str  # info | low | medium | high
    detail: str
    evidence: list[Span] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "severity": self.severity, "detail": self.detail,
                "evidence": [e.as_dict() for e in self.evidence]}


@lru_cache(maxsize=1)
def brands() -> dict:
    data = json.loads((BACKEND_DATA / "official_domains.json").read_text(encoding="utf-8"))
    return data["brands"]


@lru_cache(maxsize=1)
def official_domains() -> set[str]:
    return {d for b in brands().values() for d in b["domains"]}


def host_of(url: str) -> str:
    u = url.strip().rstrip(".,;:!?)]}'\"")
    u = re.sub(r"^hxxp", "http", u, flags=F)
    if not re.match(r"^[a-z]+://", u, F):
        u = "http://" + u
    try:
        host = urlsplit(u).hostname or ""
    except ValueError:
        host = ""
    return host.lower().strip(".")


def registered_domain(host: str) -> str:
    labels = [x for x in host.split(".") if x]
    if len(labels) <= 2:
        return ".".join(labels)
    if ".".join(labels[-2:]) in TWO_LEVEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def _edit1(a: str, b: str) -> bool:
    """True if a and b differ by at most one edit (substitution/insert/delete)."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    if len(a) > len(b):
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i:] == b[i + 1:]


def analyse_url(url: str) -> dict:
    host = host_of(url)
    reg = registered_domain(host)
    is_ip = bool(re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", host))
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    sub_count = max(0, host.count(".") - reg.count("."))
    first_label = reg.split(".")[0] if reg else ""
    official = reg in official_domains() or host in official_domains()
    lookalike_brand = None
    if not official and not is_ip:
        hay = host.translate(_DELEET)
        for name, b in brands().items():
            for d in b["domains"]:
                core = d.split(".")[0]
                if len(core) >= 4 and (core in hay.replace("-", "") or
                                       any(_edit1(core, part) for part in re.split(r"[.-]", hay) if len(part) >= 4)):
                    lookalike_brand = name
                    break
            if lookalike_brand:
                break
            for kw in b["keywords"]:
                kw2 = kw.strip().replace(" ", "")
                if len(kw2) >= 3 and re.search(r"(?:^|[.-])" + re.escape(kw2) + r"(?:[.-]|$)|" + re.escape(kw2) + "-", hay):
                    lookalike_brand = name
                    break
            if lookalike_brand:
                break
    return {
        "url": url, "host": host, "registered_domain": reg, "is_ip": is_ip, "tld": tld,
        "shortener": reg in SHORTENERS or host in SHORTENERS,
        "suspicious_tld": tld in SUSPICIOUS_TLDS,
        "many_subdomains": sub_count >= 3,
        "hyphens": first_label.count("-") + host.count("-") // 2,
        "punycode": "xn--" in host,
        "has_at": "@" in url,
        "insecure_scheme": url.lower().startswith(("http://", "hxxp://")),
        "official": official,
        "lookalike_brand": lookalike_brand,
        "digits_in_domain": bool(re.search(r"\d", first_label)) and not is_ip,
        "defanged": "[.]" in url or url.lower().startswith("hxxp"),
    }


_BRAND_TEXT_CACHE: dict[str, re.Pattern] = {}


def brands_mentioned(text: str) -> list[str]:
    low = text.lower()
    out = []
    for name, b in brands().items():
        for kw in b["keywords"]:
            kw = kw.strip()
            pat = _BRAND_TEXT_CACHE.setdefault(kw, re.compile(r"\b" + re.escape(kw) + r"\b", F))
            if pat.search(low):
                out.append(name)
                break
    return out


OTP_RE = re.compile(r"\b(?:otp|one[\s-]time\s+(?:password|pin)|verification\s+code|security\s+code|ओटीपी)\b", F)
PIN_RE = re.compile(r"\b(?:upi\s+pin|mpin|atm\s+pin|pin|cvv|password|passcode)\b", F)
CALL_RE = re.compile(r"\b(?:call|dial|contact|whatsapp|reach|ring|sampark)\b", F)
WHATSAPP_RE = re.compile(r"\b(?:whatsapp|telegram|wa\.me|t\.me)\b", F)
SUSPEND_RE = re.compile(r"\b(?:block|blocked|suspend|suspended|deactivat\w*|frozen|freeze|closed|disconnect\w*|band)\b", F)


def _amount_value(s: str) -> float:
    t = s.lower().replace(",", "")
    num = re.search(r"\d+(?:\.\d+)?", t)
    if not num:
        return 0.0
    v = float(num.group(0))
    if "lakh" in t or "lac" in t:
        v *= 1e5
    elif "crore" in t or re.search(r"\bcr\b", t) or "karod" in t:
        v *= 1e7
    elif re.search(r"\d\s?k\b", t):
        v *= 1e3
    return v


def analyse(pre: Preprocessed) -> tuple[list[Signal], dict[str, float], list[dict]]:
    text = pre.normalized
    sig: list[Signal] = []
    url_info = [analyse_url(u.text) for u in pre.urls]
    n_urls = len(pre.urls) + pre.placeholders.get("url", 0)
    n_phones = len(pre.phones) + pre.placeholders.get("phone", 0)
    mentioned = brands_mentioned(text)

    def add(id_, label, sev, detail, ev=None):
        sig.append(Signal(id_, label, sev, detail, ev or []))

    for u, info in zip(pre.urls, url_info):
        if info["shortener"]:
            add("shortened_link", "Shortened link", "medium",
                f"'{info['registered_domain']}' hides the real destination.", [u])
        if info["is_ip"]:
            add("ip_link", "Link to a raw IP address", "high", "Legitimate services use domain names.", [u])
        if info["suspicious_tld"]:
            add("suspicious_tld", "Unusual domain ending", "medium",
                f"'.{info['tld']}' domains are cheap and common in phishing.", [u])
        if info["lookalike_brand"]:
            add("lookalike_domain", "Look-alike domain", "high",
                f"'{info['host']}' resembles {info['lookalike_brand'].upper()} but is not one of its known domains.", [u])
        if info["many_subdomains"]:
            add("many_subdomains", "Excessive sub-domains", "medium", f"'{info['host']}' has an unusually deep host name.", [u])
        if info["punycode"]:
            add("punycode", "Internationalised (punycode) domain", "high", "Can disguise look-alike characters.", [u])
        if info["has_at"]:
            add("at_in_url", "'@' inside link", "high", "Text before '@' in a URL is ignored by browsers.", [u])
        if info["defanged"]:
            add("defanged_link", "Disguised link formatting", "medium", "Link written as hxxp or with [.] to evade filters.", [u])
        if info["official"]:
            add("official_domain", "Known official domain", "info",
                f"'{info['registered_domain']}' is on the local list of official domains (not a guarantee of safety).", [u])
    official_regs = {i["registered_domain"] for i in url_info if i["official"]}
    mismatch = False
    if mentioned and url_info:
        for name in mentioned:
            owned = set(brands()[name]["domains"])
            foreign = [i for i in url_info if not i["official"] and not i["shortener"]
                       and i["registered_domain"] not in owned and i["host"] not in owned]
            if foreign and not (official_regs & owned):
                mismatch = True
                add("brand_domain_mismatch", "Claimed brand ≠ link domain", "high",
                    f"Message mentions {name.upper()} but links to '{foreign[0]['registered_domain']}'.",
                    [pre.urls[url_info.index(foreign[0])]])
                break
    if pre.upi_ids:
        add("upi_id", "UPI ID present", "low", "A payment address is included in the message.", pre.upi_ids[:2])
    if n_phones and CALL_RE.search(text):
        add("call_request", "Asks you to call / message a number", "low",
            "Verify numbers independently; scammers use personal mobile numbers.", pre.phones[:2])
    if WHATSAPP_RE.search(text):
        add("messaging_app", "Moves conversation to WhatsApp/Telegram", "medium",
            "Moving off official channels is a common scam step.")
    if OTP_RE.search(text):
        add("otp_mention", "Mentions an OTP / verification code", "info", "Context decides whether this is safe.")
    amounts = [_amount_value(a.text) for a in pre.amounts]
    big = max(amounts) if amounts else 0.0
    if big >= 50000:
        add("large_amount", "Large sum of money", "low", "Large amounts are typical of prize and loan lures.", pre.amounts[:2])
    if pre.obfuscation.total() > 0:
        o = pre.obfuscation
        parts = [f"{v} {k.replace('_', ' ')}" for k, v in o.as_dict().items() if v]
        add("obfuscation", "Disguised characters", "medium" if o.homoglyphs or o.invisible_chars else "low",
            "Text uses " + ", ".join(parts) + " - a common filter-evasion trick.")

    letters = [c for c in pre.original if c.isalpha()]
    caps_ratio = (sum(c.isupper() for c in letters) / len(letters)) if letters else 0.0
    feats = {
        "has_url": float(n_urls > 0),
        "url_count": float(min(n_urls, 3)),
        "url_shortener": float(any(i["shortener"] for i in url_info)),
        "url_ip": float(any(i["is_ip"] for i in url_info)),
        "url_suspicious_tld": float(any(i["suspicious_tld"] for i in url_info)),
        "url_lookalike": float(any(i["lookalike_brand"] for i in url_info)),
        "url_official": float(bool(official_regs)),
        "url_risky_structure": float(any(i["many_subdomains"] or i["punycode"] or i["has_at"] or i["hyphens"] >= 2
                                         or i["digits_in_domain"] or i["defanged"] for i in url_info)),
        "brand_domain_mismatch": float(mismatch),
        "brand_mentioned": float(bool(mentioned)),
        "has_phone": float(n_phones > 0),
        "call_request": float(bool(n_phones and CALL_RE.search(text))),
        "messaging_app": float(bool(WHATSAPP_RE.search(text))),
        "has_email": float(bool(pre.emails) or pre.placeholders.get("email", 0) > 0),
        "has_upi": float(bool(pre.upi_ids)),
        "has_money": float(bool(pre.amounts)),
        "large_amount": float(big >= 50000),
        "otp_mention": float(bool(OTP_RE.search(text))),
        "pin_mention": float(bool(PIN_RE.search(text))),
        "suspension_word": float(bool(SUSPEND_RE.search(text))),
        "caps_ratio": round(caps_ratio, 3),
        "exclamations": float(min(pre.original.count("!"), 5)),
        "obfuscation_total": float(min(pre.obfuscation.total(), 5)),
        "log_length": round(math.log1p(len(pre.original)), 3),
    }
    return sig, feats, url_info
