"""Character- and token-level de-obfuscation.

Every function that changes text also returns an offset map so evidence found
in the normalised text can be highlighted in the *original* message.

Transformations are conservative: a digit/symbol is only reinterpreted as a
letter when the result is a known word (see ``lexicon``), so OTP codes,
account fragments and alphanumeric IDs survive untouched.
"""
from __future__ import annotations

import itertools
import re
import unicodedata
from dataclasses import dataclass, field

# Zero-width, bidi-control, soft-hyphen, BOM and similar invisible code points.
INVISIBLE = {
    "​", "‌", "‍", "‎", "‏", "⁠", "⁡", "⁢", "⁣",
    "⁤", "﻿", "­", "͏", "؜", "ᅟ", "ᅠ", "឴", "឵",
    "᠎", "‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨",
    "⁩", "ㅤ", "ﾠ",
}
# Zero-width joiners are legitimately used in Devanagari conjuncts; we only drop
# them when they sit between Latin characters (handled in clean_chars).
_INDIC_SAFE = {"‌", "‍"}

# Common cross-script look-alikes (Cyrillic / Greek / others -> Latin).
CONFUSABLES = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j",
    "ѕ": "s", "ԁ": "d", "ɡ": "g", "һ": "h", "ӏ": "l", "ԛ": "q", "ԝ": "w", "ѵ": "v", "ʏ": "y",
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C",
    "Т": "T", "У": "Y", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S", "Ү": "Y", "Ԁ": "D",
    "α": "a", "ο": "o", "ν": "v", "ρ": "p", "τ": "t", "ι": "i", "κ": "k", "υ": "u", "ε": "e",
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N",
    "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
    "ı": "i", "ȷ": "j", "ℓ": "l", "ⅰ": "i", "ⅼ": "l", "ꓲ": "I", "ꓳ": "O", "ꓴ": "U",
}

LEET = {
    "0": ["o"], "1": ["i", "l"], "3": ["e"], "4": ["a"], "5": ["s"], "7": ["t"], "8": ["ate", "b"],
    "9": ["g"], "@": ["a"], "$": ["s"], "!": ["i"], "|": ["l", "i"], "€": ["e"], "6": ["g", "b"],
}
_LEET_CHARS = set(LEET)


@dataclass
class ObfuscationStats:
    invisible_chars: int = 0
    homoglyphs: int = 0
    leet_tokens: int = 0
    spaced_words: int = 0
    repeated_chars: int = 0
    mixed_script_tokens: int = 0
    examples: list[str] = field(default_factory=list)

    def total(self) -> int:
        return (self.invisible_chars + self.homoglyphs + self.leet_tokens + self.spaced_words
                + self.repeated_chars + self.mixed_script_tokens)

    def as_dict(self) -> dict:
        return {
            "invisible_chars": self.invisible_chars,
            "homoglyphs": self.homoglyphs,
            "leet_tokens": self.leet_tokens,
            "spaced_words": self.spaced_words,
            "repeated_chars": self.repeated_chars,
            "mixed_script_tokens": self.mixed_script_tokens,
        }


def _is_latin(ch: str) -> bool:
    return ("a" <= ch.lower() <= "z")


def clean_chars(text: str, stats: ObfuscationStats) -> tuple[str, list[int]]:
    """Remove invisible characters, map look-alikes, apply NFKC per character.

    Returns the cleaned string and, for each output character, the index of the
    original character it came from.
    """
    out: list[str] = []
    idx: list[int] = []
    n = len(text)
    latin = sum(1 for c in text if _is_latin(c))
    non_latin_letters = sum(1 for c in text if c.isalpha() and not _is_latin(c) and c not in CONFUSABLES)
    latin_dominant = latin >= non_latin_letters
    for i, ch in enumerate(text):
        if ch in INVISIBLE:
            if ch in _INDIC_SAFE:
                prev = text[i - 1] if i > 0 else ""
                nxt = text[i + 1] if i + 1 < n else ""
                if not (_is_latin(prev) or _is_latin(nxt) or prev.isdigit() or nxt.isdigit()):
                    out.append(ch)
                    idx.append(i)
                    continue
            stats.invisible_chars += 1
            continue
        if ch in CONFUSABLES and latin_dominant:
            stats.homoglyphs += 1
            out.append(CONFUSABLES[ch])
            idx.append(i)
            continue
        norm = unicodedata.normalize("NFKC", ch)
        if norm != ch and ch.isalnum() and all(_is_latin(c) or c.isdigit() for c in norm):
            # Styled letters (fullwidth, mathematical bold, circled...) used to dodge filters.
            stats.homoglyphs += 1
        for c in norm:
            out.append(c)
            idx.append(i)
    return "".join(out), idx


def has_mixed_script(token: str) -> bool:
    scripts = set()
    for c in token:
        if not c.isalpha():
            continue
        if _is_latin(c):
            scripts.add("latin")
        else:
            try:
                scripts.add(unicodedata.name(c).split()[0])
            except ValueError:
                scripts.add("other")
    return len(scripts) > 1


def deleet(token: str, vocab: set[str]) -> str | None:
    """Return the de-leeted word if ``token`` decodes to a known word, else None."""
    low = token.lower()
    if low in vocab:
        return None
    if not any(c.isalpha() for c in low) or not any(c in _LEET_CHARS for c in low):
        return None
    if sum(c.isdigit() for c in low) > max(2, len(low) // 2):
        return None  # mostly digits: an ID or code, not a disguised word
    options = [LEET.get(c, [c]) for c in low]
    combos = 1
    for o in options:
        combos *= len(o)
    if combos > 256:
        return None
    for parts in itertools.product(*options):
        cand = "".join(parts)
        if cand in vocab:
            return cand
    # trailing "!"/"$" can be genuine punctuation/currency: retry without them
    stripped = low.rstrip("!$")
    if stripped != low and stripped:
        r = deleet(stripped, vocab)
        if r:
            return r + token[len(stripped):]
        if stripped in vocab:
            return None
    return None


_REPEAT_RE = re.compile(r"([a-z])\1{2,}", re.IGNORECASE)


def collapse_repeats(token: str, vocab: set[str]) -> str | None:
    """"verifyyyy" -> "verify", "sooo" -> "soo"; None if no long runs."""
    if not _REPEAT_RE.search(token):
        return None
    one = _REPEAT_RE.sub(r"\1", token)
    if one.lower() in vocab:
        return one
    two = _REPEAT_RE.sub(r"\1\1", token)
    if two.lower() in vocab:
        return two
    return one


def match_case(src: str, repl: str) -> str:
    if src.isupper() and len(src) > 1:
        return repl.upper()
    if src[:1].isupper():
        return repl[:1].upper() + repl[1:]
    return repl
