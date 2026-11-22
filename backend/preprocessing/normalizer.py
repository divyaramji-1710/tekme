"""Preprocessing orchestrator.

``preprocess(text)`` returns a :class:`Preprocessed` object that keeps

* ``original``   - the message exactly as received (never modified)
* ``normalized`` - de-obfuscated, abbreviation-expanded, spelling-canonical text
                   used by the rule engines, with an offset map back to ``original``
* ``model_text`` - lower-cased text with entities masked (xurlx, xphonex, ...)
                   plus English glosses, used by the statistical models
* ``entities``   - URLs, phones, e-mails, UPI IDs, amounts and codes extracted
                   from the de-obfuscated text *before* masking

Structural evidence is therefore never destroyed by normalisation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from backend.preprocessing import hinglish
from backend.preprocessing.lexicon import vocabulary
from backend.preprocessing.obfuscation import (
    CONFUSABLES, ObfuscationStats, clean_chars, collapse_repeats, deleet, match_case,
)
from backend.preprocessing.patterns import (
    CODE_RE, EMAIL_RE, LONG_NUMBER_RE, MONEY_RE, PHONE_RE, PLACEHOLDER_RE, UPI_RE, iter_urls, sub_urls,
)

_WORD_RE = re.compile(r"a/c|[^\W_@$|](?:[^\W_]|[@$|€](?=[^\W_])|!(?=[^\W_!]))*", re.IGNORECASE)
_SEP_RE = re.compile(r"[ \t]{1,3}|[ \t]?[.\-_*][ \t]?")
_ACRONYMS = {"kyc", "otp", "upi", "pan", "sbi", "cvv", "atm", "emi", "pin", "rbi", "hdfc", "icici",
             "sms", "kbc", "gst", "ifsc", "uidai", "npci", "trai", "itr", "epfo", "neft", "imps"}


@dataclass
class Span:
    text: str
    start: int  # offsets in the ORIGINAL message
    end: int

    def as_dict(self) -> dict:
        return {"text": self.text, "start": self.start, "end": self.end}


@dataclass
class Preprocessed:
    original: str
    normalized: str
    offsets: list[tuple[int, int]]
    model_text: str
    language: str
    urls: list[Span] = field(default_factory=list)
    emails: list[Span] = field(default_factory=list)
    phones: list[Span] = field(default_factory=list)
    upi_ids: list[Span] = field(default_factory=list)
    amounts: list[Span] = field(default_factory=list)
    codes: list[Span] = field(default_factory=list)
    placeholders: dict[str, int] = field(default_factory=dict)
    obfuscation: ObfuscationStats = field(default_factory=ObfuscationStats)

    def to_original(self, start: int, end: int) -> tuple[int, int]:
        """Map a [start, end) span of ``normalized`` onto ``original``."""
        if not self.offsets or start >= end:
            return (0, 0)
        start = max(0, min(start, len(self.offsets) - 1))
        end = max(start + 1, min(end, len(self.offsets)))
        return (self.offsets[start][0], self.offsets[end - 1][1])

    def span(self, start: int, end: int) -> Span:
        s, e = self.to_original(start, end)
        return Span(self.original[s:e], s, e)


def _protected_spans(text: str) -> list[tuple[int, int, str]]:
    """Entity spans that must not be altered by de-obfuscation."""
    taken: list[tuple[int, int, str]] = []

    def add(rx, kind: str) -> None:
        matches = iter_urls(text) if rx == "url" else rx.finditer(text)
        for m in matches:
            s, e = m.span()
            if any(not (e <= a or s >= b) for a, b, _ in taken):
                continue
            taken.append((s, e, kind))

    add(PLACEHOLDER_RE, "placeholder")
    add("url", "url")
    add(UPI_RE, "upi")
    add(EMAIL_RE, "email")
    add(PHONE_RE, "phone")
    return sorted(taken)


def _tokenize(text: str) -> list[tuple[int, int, str]]:
    """Split into (start, end, kind) pieces; kind in entity kinds | word | other."""
    pieces: list[tuple[int, int, str]] = []
    pos = 0
    for s, e, kind in _protected_spans(text):
        pieces.extend(_tokenize_plain(text, pos, s))
        pieces.append((s, e, kind))
        pos = e
    pieces.extend(_tokenize_plain(text, pos, len(text)))
    return pieces


def _tokenize_plain(text: str, start: int, end: int) -> list[tuple[int, int, str]]:
    out = []
    pos = start
    for m in _WORD_RE.finditer(text, start, end):
        if m.start() > pos:
            out.append((pos, m.start(), "other"))
        out.append((m.start(), m.end(), "word"))
        pos = m.end()
    if pos < end:
        out.append((pos, end, "other"))
    return out


def _merge_spaced(text: str, pieces: list[tuple[int, int, str]], vocab, stats) -> list[tuple[int, int, str, str]]:
    """Join runs like "K Y C" / "v.e.r.i.f.y" into single word tokens.

    Returns (start, end, kind, replacement_text_or_empty).
    """
    out: list[tuple[int, int, str, str]] = []
    i = 0
    n = len(pieces)
    while i < n:
        s, e, kind = pieces[i]
        if kind == "word" and e - s == 1 and text[s].isalnum():
            j = i
            letters = [text[s]]
            last = i
            while (j + 2 < n and pieces[j + 1][2] == "other"
                   and _SEP_RE.fullmatch(text[pieces[j + 1][0]:pieces[j + 1][1]])
                   and pieces[j + 2][2] == "word" and pieces[j + 2][1] - pieces[j + 2][0] == 1
                   and text[pieces[j + 2][0]].isalnum()):
                letters.append(text[pieces[j + 2][0]])
                j += 2
                last = j
            merged = "".join(letters)
            low = merged.lower()
            if len(letters) >= 3 and any(c.isalpha() for c in low) and (
                    low in vocab or low in _ACRONYMS or (len(low) >= 5 and low.isalpha())):
                stats.spaced_words += 1
                stats.examples.append(text[s:pieces[last][1]])
                out.append((s, pieces[last][1], "word", merged))
                i = last + 1
                continue
        out.append((s, e, kind, ""))
        i += 1
    return out


def _transform_word(tok: str, vocab, stats: ObfuscationStats) -> str:
    word = tok
    r = collapse_repeats(word, vocab)
    if r is not None and r != word:
        stats.repeated_chars += 1
        word = r
    d = deleet(word, vocab)
    if d is not None:
        stats.leet_tokens += 1
        stats.examples.append(tok)
        word = match_case(word, d)
    c = hinglish.canonical_token(word)
    if c is not None:
        word = match_case(word, c)
    return word


def _find(rx, pre: Preprocessed, text: str) -> list[Span]:
    matches = iter_urls(text) if rx == "url" else rx.finditer(text)
    return [pre.span(*m.span()) for m in matches]


def preprocess(text: str) -> Preprocessed:
    original = text if isinstance(text, str) else str(text)
    stats = ObfuscationStats()
    vocab = vocabulary()
    s1, m1 = clean_chars(original, stats)
    stats.mixed_script_tokens = sum(
        1 for tok in re.findall(r"\S+", original)
        if any(c in CONFUSABLES for c in tok) and any("a" <= c.lower() <= "z" for c in tok))

    pieces = _merge_spaced(s1, _tokenize(s1), vocab, stats)
    out_chars: list[str] = []
    offsets: list[tuple[int, int]] = []

    def orig_span(a: int, b: int) -> tuple[int, int]:
        if not m1:
            return (0, 0)
        return (m1[a], m1[b - 1] + 1)

    for s, e, kind, merged in pieces:
        piece = s1[s:e]
        new = piece
        if kind == "word":
            new = _transform_word(merged or piece, vocab, stats)
        if new == piece:
            for k in range(s, e):
                out_chars.append(s1[k])
                offsets.append((m1[k], m1[k] + 1))
        else:
            span = orig_span(s, e)
            for ch in new:
                out_chars.append(ch)
                offsets.append(span)
    normalized = "".join(out_chars)

    pre = Preprocessed(original=original, normalized=normalized, offsets=offsets,
                       model_text="", language=hinglish.detect_language(normalized),
                       obfuscation=stats)
    pre.placeholders = {}
    for m in PLACEHOLDER_RE.finditer(normalized):
        key = m.group(0)[1:-1].lower()
        pre.placeholders[key] = pre.placeholders.get(key, 0) + 1
    pre.urls = _find("url", pre, normalized)
    pre.upi_ids = _find(UPI_RE, pre, normalized)
    upi_texts = {u.text for u in pre.upi_ids}
    pre.emails = [s for s in _find(EMAIL_RE, pre, normalized) if s.text not in upi_texts]
    url_ranges = [(u.start, u.end) for u in pre.urls]
    pre.phones = [p for p in _find(PHONE_RE, pre, normalized)
                  if not any(a <= p.start < b for a, b in url_ranges)]
    pre.amounts = _find(MONEY_RE, pre, normalized)
    phone_ranges = [(p.start, p.end) for p in pre.phones]
    pre.codes = [c for c in _find(CODE_RE, pre, normalized)
                 if not any(a <= c.start < b for a, b in phone_ranges + url_ranges)
                 and not any(a.start <= c.start < a.end for a in pre.amounts)]
    pre.model_text = build_model_text(normalized)
    return pre


def build_model_text(normalized: str) -> str:
    t = normalized
    t = PLACEHOLDER_RE.sub(lambda m: {"<URL>": " xurlx ", "<PHONE_NUMBER>": " xphonex ",
                                      "<EMAIL_ADDRESS>": " xemailx ", "<NUMBER>": " xnumx "}[m.group(0)], t)
    t = sub_urls(" xurlx ", t)
    t = UPI_RE.sub(" xupix ", t)
    t = EMAIL_RE.sub(" xemailx ", t)
    t = PHONE_RE.sub(" xphonex ", t)
    t = LONG_NUMBER_RE.sub(" xnumx ", t)
    t = t.lower()
    t = re.sub(r"\s+", " ", t).strip()
    g = hinglish.glosses(normalized)
    if g:
        t = t + " " + " ".join(g)
    return t
