"""Shared regular expressions for structural entities (URLs, phones, money...).

These are used both to *extract* evidence from the original text and to *mask*
entities in the model text, so the same definitions are applied everywhere.
"""
from __future__ import annotations

import re

# Placeholder tokens used by the Scam Shield dataset (privacy masking).
PLACEHOLDERS = {
    "<URL>": "url",
    "<PHONE_NUMBER>": "phone",
    "<EMAIL_ADDRESS>": "email",
    "<NUMBER>": "number",
}
PLACEHOLDER_RE = re.compile(r"<(?:URL|PHONE_NUMBER|EMAIL_ADDRESS|NUMBER)>")

# A practical TLD list for scheme-less domains ("bit.ly/x", "sbi-kyc.xyz").
# English words that are also TLDs (me, to, so, is, at, ...) are deliberately
# excluded to avoid matching typos such as "ok.so" in ordinary chat.
_TLDS = (
    "com|in|net|org|info|biz|io|co|ly|gl|gd|cc|tk|ml|ga|cf|gq|xyz|top|club|online|site|"
    "icu|live|buzz|click|link|work|loan|win|vip|shop|store|app|dev|tech|ru|cn|uk|us|ca|au|"
    "sg|ae|za|ng|ke|ph|my|hk|nz|ie|pk|bd|lk|np|de|fr|nl|eu|asia|support|services|"
    "money|finance|bank|pro|space|website|cloud|digital|network|gov|edu|ac|"
    "ws|su|bz|vg|mobi|tv|ai|pw|cyou|sbs|cfd|lat"
)
_B = "\\b"
_END = r"[^\s<>\"'.,;:!?)\]}]"  # a URL never ends with sentence punctuation
URL_RE = re.compile(
    r"(?:(?:https?|hxxps?)://|www\.)[^\s<>\"']*" + _END
    + r"|(?<![\w.])(?:wa|t)\.me/(?:[^\s<>\"']*" + _END + r")?"
    r"|(?<![\w.@-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:" + _TLDS + r")(?![\w-])(?:/(?:[^\s<>\"']*" + _END + r")?)?"
    r"|(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:/(?:[^\s<>\"']*" + _END + r")?)?",
    re.IGNORECASE,
)


def _plausible_url(m: re.Match) -> bool:
    """Reject sentence typos such as "Done.In" or "Hi.How" (no space after a full stop)."""
    t = m.group(0)
    if re.match(r"(?:https?|hxxps?)://|www\.", t, re.IGNORECASE) or "/" in t:
        return True
    if re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?", t):
        return True
    labels = t.split(".")
    # every label after the first must be lower-case: real domains in SMS are written that way
    return all(lbl == lbl.lower() for lbl in labels[1:])


def iter_urls(text: str):
    for m in URL_RE.finditer(text):
        if _plausible_url(m):
            yield m


def sub_urls(repl: str, text: str) -> str:
    out, pos = [], 0
    for m in iter_urls(text):
        out.append(text[pos:m.start()])
        out.append(repl)
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)


UPI_RE = re.compile(
    _B + r"[\w.\-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|upi|apl|yapl|icici|sbi|hdfcbank|axisbank|kotak|"
    r"barodampay|aubank|jupiteraxis|fbl|pthdfc|ptyes|ptaxis|ptsbi|naviaxis|freecharge|airtel|jio)" + _B,
    re.IGNORECASE,
)
EMAIL_RE = re.compile(_B + r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}" + _B, re.IGNORECASE)

PHONE_RE = re.compile(
    r"(?<![\w+])(?:"
    r"\+\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){1,4}"      # international
    r"|(?:0)?[6-9]\d{4}[\s-]?\d{5}"                               # Indian mobile
    r"|0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}"                        # landline / UK
    r"|1[-\s]?8[06]0[-\s]?\d{3}[-\s]?\d{4}"                       # Indian toll-free
    r"|\(\d{3}\)\s?\d{3}[\s-]?\d{4}"                              # US (555) 123-4567
    r"|\d{3}-\d{3}-\d{4}"                                         # US 555-123-4567
    r")(?![\w])"
)

MONEY_RE = re.compile(
    r"(?:₹|" + _B + r"rs\.?|" + _B + r"inr|" + _B + r"usd|\$|£|€|" + _B + r"gbp|" + _B + r"aed|"
    + _B + r"php|" + _B + r"ngn|" + _B + r"kes)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lac|lakhs|crore|cr|k)" + _B + r")?"
    r"|" + _B + r"\d[\d,]*(?:\.\d+)?\s?(?:rs|rupees|rupaye|inr|lakh|lakhs|lac|crore|crores|karod|dollars|pounds)" + _B,
    re.IGNORECASE,
)
LONG_NUMBER_RE = re.compile(r"\d{4,}")
CODE_RE = re.compile(r"(?<![\d])\d{4,8}(?![\d])")

SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "is.gd", "cutt.ly", "rb.gy", "ow.ly", "shorturl.at",
    "tiny.cc", "s.id", "bit.do", "rebrand.ly", "v.gd", "buff.ly", "t.ly", "shorte.st", "adf.ly",
    "tinyurl.is", "clck.ru", "qr.net", "lnkd.in", "bl.ink", "short.io", "shrtco.de", "u.to", "x.co",
    "wa.me", "t.me", "linktr.ee", "surl.li", "1url.com", "trib.al", "inx.lv", "rebrandly.com",
}
SUSPICIOUS_TLDS = {
    "xyz", "top", "club", "online", "site", "icu", "live", "buzz", "click", "link", "work", "loan",
    "win", "vip", "tk", "ml", "ga", "cf", "gq", "rest", "bar", "cyou", "sbs", "cfd", "lat", "pw",
    "support", "services", "help", "money", "space", "website", "fun", "today", "su",
}
TWO_LEVEL_SUFFIXES = {
    "bank.in", "co.in", "gov.in", "org.in", "net.in", "ac.in", "edu.in", "nic.in", "res.in", "firm.in", "ind.in",
    "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "gov.au", "co.nz", "com.sg", "gov.sg", "co.za",
    "com.ng", "gov.ng", "co.ke", "com.ph", "com.my", "com.hk", "gov.hk", "com.pk", "gov.pk", "com.bd",
}
