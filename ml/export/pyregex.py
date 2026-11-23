"""Translate Python ``re`` patterns into equivalent JavaScript (``u`` flag) patterns.

Python's ``\\b``, ``\\w``, ``\\d`` and ``\\s`` are Unicode-aware; JavaScript's are ASCII-only even with
the ``u`` flag. This translator rewrites them with explicit Unicode property classes so the browser
engine matches exactly what the Python engine matches. Anything it does not understand raises, so a
silent mistranslation is impossible; correctness is then checked end-to-end by the parity corpus
(``ml/export/parity.py``).
"""
from __future__ import annotations

import re

# Python ``\\w`` == str.isalnum() or "_" == letters (L*) + numbers (N*) + underscore.
W_INNER = r"\p{L}\p{N}_"
W = f"[{W_INNER}]"
# Python str.isspace() code points (what ``\\s`` and ``str.split()`` use).
WS_INNER = r"\t\n\v\f\r\x1c-\x20\x85\xa0  -     　"
WORD_BOUNDARY = f"(?:(?<={W})(?!{W})|(?<!{W})(?={W}))"
_JS_SYNTAX = set("^$\\.*+?()[]{}|/")


def to_js(pattern: str) -> str:
    p = pattern
    out: list[str] = []
    i, n = 0, len(p)
    in_class = False
    while i < n:
        ch = p[i]
        if ch == "\\":
            if i + 1 >= n:
                raise ValueError(f"dangling escape in {pattern!r}")
            c = p[i + 1]
            i += 2
            if c == "b":
                if in_class:
                    raise ValueError("\\b inside a class")
                out.append(WORD_BOUNDARY)
            elif c == "w":
                out.append(W_INNER if in_class else W)
            elif c == "W":
                if in_class:
                    raise ValueError(f"\\W inside a class needs manual handling: {pattern!r}")
                out.append(f"[^{W_INNER}]")
            elif c == "d":
                out.append(r"\p{Nd}")
            elif c == "D":
                out.append(r"\P{Nd}")
            elif c == "s":
                out.append(WS_INNER if in_class else f"[{WS_INNER}]")
            elif c == "S":
                if in_class:
                    raise ValueError("\\S inside a class")
                out.append(f"[^{WS_INNER}]")
            elif c in "B AZz":
                raise ValueError(f"unsupported escape \\{c} in {pattern!r}")
            elif c.isdigit():
                out.append("\\" + c)  # backreference
            elif c in "ntrfv":
                out.append("\\" + c)
            elif c in _JS_SYNTAX or (in_class and c == "-"):
                out.append("\\" + c)
            elif c.isalnum():
                raise ValueError(f"unknown escape \\{c} in {pattern!r}")
            else:
                out.append(c)  # \" \' \@ ... are plain characters
            continue
        if in_class:
            if ch == "]":
                in_class = False
            out.append(ch)
            i += 1
            continue
        if ch == "[":
            # [^\W_...] == word characters minus "_" (the listed extras are non-word anyway)
            m = re.match(r"\[\^\\W_([^\]\\]|\\.)*\]", p[i:])
            if m:
                extras = re.sub(r"\\(.)", r"\1", m.group(0)[5:-1])
                if any(e.isalnum() or e == "_" for e in extras):
                    raise ValueError(f"cannot translate {m.group(0)!r}")
                out.append(r"[\p{L}\p{N}]")
                i += len(m.group(0))
                continue
            in_class = True
            out.append(ch)
            i += 1
            if i < n and p[i] == "^":
                out.append("^")
                i += 1
            if i < n and p[i] == "]":  # literal ] as first member
                out.append("\\]")
                i += 1
            continue
        if ch == "." :
            out.append(r"[^\n]")
        elif ch == "$":
            out.append(r"(?=\n?(?![\s\S]))")
        elif p.startswith("(?u)", i):
            i += 4
            continue
        elif p.startswith("(?P", i) or (p.startswith("(?", i) and i + 2 < n and p[i + 2] in "aiLmsux-"):
            raise ValueError(f"unsupported group syntax in {pattern!r}")
        else:
            out.append(ch)
        i += 1
    if in_class:
        raise ValueError(f"unterminated class in {pattern!r}")
    return "".join(out)


def export(rx: re.Pattern) -> dict:
    flags = "u"
    if rx.flags & re.IGNORECASE:
        flags += "i"
    if rx.flags & (re.MULTILINE | re.DOTALL | re.VERBOSE):
        raise ValueError(f"unsupported flags on {rx.pattern!r}")
    return {"source": to_js(rx.pattern), "flags": flags}
