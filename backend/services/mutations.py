"""Adversarial Mutation Lab: controlled, deterministic rewrites of a message.

Every mutation is local string manipulation. When a mutation needs a link it
only rewrites links already in the message (defanging, scheme changes) - it
never invents realistic phishing URLs; the only domain it may add is the
reserved, non-resolvable ``example.invalid`` placeholder.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass

from backend.preprocessing.patterns import iter_urls

TARGET_WORDS = {
    "account", "verify", "kyc", "blocked", "block", "otp", "prize", "won", "winner", "lottery", "loan",
    "job", "click", "link", "update", "bank", "urgent", "immediately", "suspended", "claim", "pay",
    "fee", "reward", "cash", "free", "card", "pin", "password", "congratulations", "earn", "income",
    "investment", "profit", "selected", "offer", "credit", "refund", "deposit", "customer", "expire",
    "expires", "today", "now", "call", "send", "share", "details", "login", "secure", "security",
    "aadhaar", "pan", "delivery", "parcel", "order", "payment", "transfer", "money", "salary",
}
LEET_MAP = {"o": "0", "i": "1", "e": "3", "a": "4", "s": "5", "t": "7", "l": "1", "g": "9"}
HOMOGLYPHS = {"a": "а", "e": "е", "o": "о", "p": "р", "c": "с", "x": "х", "y": "у", "i": "і", "s": "ѕ",
              "A": "А", "E": "Е", "O": "О", "P": "Р", "C": "С", "K": "К", "M": "М", "T": "Т", "H": "Н", "B": "В"}
ABBREV = [(r"\byour\b", "ur"), (r"\byou\b", "u"), (r"\baccount\b", "acc"), (r"\bplease\b", "pls"),
          (r"\bmessage\b", "msg"), (r"\bbefore\b", "b4"), (r"\btoday\b", "2day"), (r"\btomorrow\b", "tmrw"),
          (r"\bimmediately\b", "immd"), (r"\bamount\b", "amt"), (r"\bbalance\b", "bal"), (r"\bupdate\b", "upd8"),
          (r"\bgreat\b", "gr8"), (r"\bthanks\b", "thx"), (r"\bpassword\b", "pwd"), (r"\btransaction\b", "txn"),
          (r"\bare\b", "r"), (r"\bfor\b", "4"), (r"\bto\b", "2")]
HINGLISH = [
    (r"\byour account\b", "aapka account"), (r"\byour\b", "aapka"), (r"\bwill be blocked\b", "block ho jayega"),
    (r"\bwill be suspended\b", "suspend ho jayega"), (r"\bhas been blocked\b", "block ho gaya hai"),
    (r"\bhas been suspended\b", "suspend ho gaya hai"), (r"\bwill be deactivated\b", "band ho jayega"),
    (r"\bimmediately\b", "turant"), (r"\burgent(?:ly)?\b", "jaldi"), (r"\bnow\b", "abhi"), (r"\btoday\b", "aaj"),
    (r"\btomorrow\b", "kal"), (r"\bclick here\b", "yahan click karein"), (r"\bclick\b", "click karein"),
    (r"\bupdate\b", "update karein"), (r"\bverify\b", "verify karein"), (r"\byou have won\b", "aapne jeeta hai"),
    (r"\bcongratulations\b", "badhai ho"), (r"\bcall\b", "call karein"), (r"\bsend\b", "bhejein"),
    (r"\bpay\b", "pay karein"), (r"\botherwise\b", "nahi toh"), (r"\bdo not share\b", "share na karein"),
    (r"\bwith anyone\b", "kisi ke saath"), (r"\bhas been delivered\b", "deliver ho gaya hai"),
    (r"\band\b", "aur"), (r"\bmoney\b", "paisa"), (r"\bjob\b", "naukri"), (r"\bearn\b", "kamaayein"),
    (r"\bprize\b", "inaam"), (r"\bfree\b", "muft"), (r"\bthank you\b", "dhanyavaad"), (r"\bplease\b", "kripya"),
]

MUTATION_TYPES = {
    "char_substitution": "Swap letters for look-alike digits (acc0unt, v3rify)",
    "spacing": "Space out key words (K Y C, v e r i f y)",
    "punctuation_split": "Split key words with dots/dashes (v.e.r.i.f.y)",
    "mixed_case": "Random capitalisation (vErIfY yOuR aCcOuNt)",
    "abbreviation": "SMS abbreviations (ur acc, pls, 2day)",
    "unicode_confusables": "Replace Latin letters with Cyrillic look-alikes",
    "invisible_chars": "Insert zero-width characters inside words",
    "hinglish": "Rewrite common phrases in Romanised Hindi",
    "repeated_chars": "Stretch letters and punctuation (urgentttt!!!)",
    "url_variation": "Reformat links (defanged hxxp, [.] dots, no scheme)",
    "combined": "Character substitution + spacing + mixed case together",
}
# Mutations also used (at a lower rate) for training-set augmentation. The rest are
# held out so robustness on them measures generalisation of the normaliser.
TRAIN_AUGMENT_TYPES = ["char_substitution", "spacing", "mixed_case", "abbreviation", "hinglish"]


@dataclass
class Mutation:
    type: str
    description: str
    text: str
    changed: bool


_WORD = re.compile(r"[A-Za-z]{3,}")


def _targets(text: str) -> list[re.Match]:
    words = list(_WORD.finditer(text))
    t = [m for m in words if m.group(0).lower() in TARGET_WORDS]
    return t or words


def _apply_to_words(text: str, fn, rng: random.Random, frac: float = 0.6) -> str:
    targets = _targets(text)
    if not targets:
        return text
    k = max(1, int(round(len(targets) * frac)))
    chosen = sorted(rng.sample(targets, min(k, len(targets))), key=lambda m: m.start())
    out, pos = [], 0
    for m in chosen:
        out.append(text[pos:m.start()])
        out.append(fn(m.group(0)))
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)


def _leet(w: str, rng: random.Random) -> str:
    idx = [i for i, c in enumerate(w) if c.lower() in LEET_MAP]
    if not idx:
        return w
    pick = set(rng.sample(idx, max(1, len(idx) // 2)))
    return "".join(LEET_MAP[c.lower()] if i in pick else c for i, c in enumerate(w))


def _protect_urls(text: str, fn):
    """Apply fn to non-URL text only."""
    out, pos = [], 0
    for m in iter_urls(text):
        out.append(fn(text[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(fn(text[pos:]))
    return "".join(out)


def mutate(text: str, kind: str, seed: int = 0) -> str:
    rng = random.Random(f"{seed}:{kind}:{text}")
    if kind == "char_substitution":
        return _protect_urls(text, lambda t: _apply_to_words(t, lambda w: _leet(w, rng), rng))
    if kind == "spacing":
        return _protect_urls(text, lambda t: _apply_to_words(t, lambda w: " ".join(w), rng, 0.4))
    if kind == "punctuation_split":
        sep = rng.choice([".", "-", "*"])
        return _protect_urls(text, lambda t: _apply_to_words(t, lambda w: sep.join(w), rng, 0.4))
    if kind == "mixed_case":
        return _protect_urls(text, lambda t: "".join(c.upper() if rng.random() < 0.5 else c.lower() for c in t))
    if kind == "abbreviation":
        def ab(t):
            for pat, rep in ABBREV:
                t = re.sub(pat, rep, t, flags=re.IGNORECASE)
            return t
        return _protect_urls(text, ab)
    if kind == "unicode_confusables":
        return _protect_urls(text, lambda t: _apply_to_words(
            t, lambda w: "".join(HOMOGLYPHS.get(c, c) if rng.random() < 0.6 else c for c in w), rng, 0.8))
    if kind == "invisible_chars":
        return _protect_urls(text, lambda t: _apply_to_words(
            t, lambda w: "​".join(w) if len(w) < 6 else w[:2] + "​" + w[2:4] + "‌" + w[4:], rng, 0.7))
    if kind == "hinglish":
        def hi(t):
            for pat, rep in HINGLISH:
                t = re.sub(pat, rep, t, flags=re.IGNORECASE)
            return t
        return _protect_urls(text, hi)
    if kind == "repeated_chars":
        def rep(w):
            i = rng.randrange(len(w))
            return w[:i + 1] + w[i] * rng.randint(2, 4) + w[i + 1:]
        t = _protect_urls(text, lambda s: _apply_to_words(s, rep, rng, 0.5))
        return re.sub(r"([!?.])(\s|$)", lambda m: m.group(1) * rng.randint(2, 4) + m.group(2), t, count=2)
    if kind == "url_variation":
        urls = list(iter_urls(text))
        if not urls:
            return text
        out, pos = [], 0
        for m in urls:
            u = m.group(0)
            style = rng.choice(["defang", "brackets", "noscheme", "upper"])
            if style == "defang":
                u = re.sub(r"^https?", "hxxp", u, flags=re.IGNORECASE) if u.lower().startswith("http") else "hxxp://" + u
            elif style == "brackets":
                u = u.replace(".", "[.]")
            elif style == "noscheme":
                u = re.sub(r"^https?://", "", u, flags=re.IGNORECASE)
            else:
                u = u.upper()
            out.append(text[pos:m.start()])
            out.append(u)
            pos = m.end()
        out.append(text[pos:])
        return "".join(out)
    if kind == "combined":
        t = mutate(text, "char_substitution", seed)
        t = mutate(t, "spacing", seed + 1)
        return mutate(t, "mixed_case", seed + 2)
    raise ValueError(f"unknown mutation type: {kind}")


def generate(text: str, types: list[str] | None = None, variants_per_type: int = 1, seed: int = 0) -> list[Mutation]:
    kinds = types or list(MUTATION_TYPES)
    out: list[Mutation] = []
    for k in kinds:
        if k not in MUTATION_TYPES:
            raise ValueError(f"unknown mutation type: {k}")
        seen = set()
        for v in range(variants_per_type):
            t = mutate(text, k, seed + v * 7919)
            if t in seen:
                continue
            seen.add(t)
            out.append(Mutation(k, MUTATION_TYPES[k], t, t != text))
    return out
