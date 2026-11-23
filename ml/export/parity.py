"""Build the Python reference outputs that the browser engine must reproduce.

Writes ``ml/artifacts/parity/corpus.jsonl`` (git-ignored: it contains dataset texts). Each line holds a
message and the Python engine's intermediate and final outputs. Offsets are converted from Python code
points to UTF-16 code units, which is what JavaScript strings use.

Corpus (fixed, seeded): full test split, Test B, 1,000 adversarial variants, 500 validation messages, the
UI examples and hand-written edge cases (emoji, Devanagari, homoglyphs, invisible characters, empty-ish text).
The parity check verifies an implementation, it does not tune any model.

Usage:  python -m ml.export.parity
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from backend.core.config import BACKEND_DATA, ROOT
from backend.engines.categorizer import category_text
from backend.engines import semantic
from backend.services.inference import TekmeModel

OUT = ROOT / "ml" / "artifacts" / "parity"
DATA = ROOT / "ml" / "datasets" / "processed"

EDGE_CASES = [
    "🎉🎉 Congratulations!!! You WON ₹25,00,000 in KBC lucky draw 🎁 call +91 98765 43210 now",
    "Your 𝐀𝐜𝐜𝐨𝐮𝐧𝐭 will be 𝐁𝐋𝐎𝐂𝐊𝐄𝐃 today. Verify at http://sbi-kyc.example/login",
    "Dear customer, your a​c​c​o​u​n​t is blocked. Update KYC: bit.ly/x1",
    "आपका खाता बंद हो जाएगा। तुरंत KYC अपडेट करें लिंक पर क्लिक करें",
    "Aapka khata band ho jayega turant KYC update karein warna jurmana lagega",
    "K Y C pending!! v.e.r.i.f.y now at hxxp://secure-update[.]example/kyc",
    "Ваш аккаунт заблокирован",
    "Your OTP is 482913. Do not share it with anyone. -HDFC Bank",
    "482913 is your OTP for login. Share it with our agent to stop blocking.",
    "ok",
    "   ",
    "🙂🙂🙂",
    "Hi mom this is my new number, I lost my phone. Can you send 5000 urgently? Don't tell dad",
    "Rs.2,500.00 debited from A/c XX1234 on 12-03-24 to VPA abc@okaxis. Avl Bal Rs 10,234. Not you? Call 1800-123-4567",
    "Earn 5000 per day!!! Part time job, like YouTube videos. WhatsApp wa.me/911234567890",
    "Your parcel is out for delivery today. Track: https://www.indiapost.gov.in",
    "x" * 300,
    "ＦＲＥＥ ｇｉｆｔ ｃａｒｄ ｃｌａｉｍ ｎｏｗ",
    "Pay ₹10 processing fee to claim your loan of 5 lakh. UPI: loanhelp@ybl",
    "Line one\nLine two with link www.example.com/path?x=1\n\nLine four",
]


def _u16(text: str, i: int) -> int:
    return len(text[:i].encode("utf-16-le")) // 2


def _spans(text: str, spans: list[dict]) -> list[list[int]]:
    return [[_u16(text, s["start"]), _u16(text, s["end"])] for s in spans]


def reference(model: TekmeModel, text: str) -> dict:
    p, outs, rows = model.scam_probability([text])
    o, row, pi = outs[0], rows[0], float(p[0])
    full = model.predict(text)
    pre = o.pre
    orig = pre.original
    ctext = category_text(pre.model_text, [h.id for h in o.tactic_hits])
    rec = {
        "text": text,
        "normalized": pre.normalized,
        "model_text": pre.model_text,
        "language": pre.language,
        "entities": {k: _spans(orig, [s.as_dict() for s in getattr(pre, k)])
                     for k in ("urls", "emails", "phones", "upi_ids", "amounts", "codes")},
        "obfuscation": pre.obfuscation.as_dict(),
        "features": row,
        "sem_logit": float(semantic.decision(model.semantic, [pre.model_text])[0]),
        "spec_logit_raw": float(semantic.decision(model.specialist, [pre.model_text])[0]),
        "fusion_logit": float(model.fusion.logit([row])[0]),
        "scam_probability": pi,
        "verdict": full["verdict"],
        "category": full["category"],
        "category_probabilities": model.category.predict([ctext])[0][2],
        "tactics": [{"id": h.id, "strength": h.strength, "evidence": _spans(orig, [e.as_dict() for e in h.evidence])}
                    for h in o.tactic_hits],
        "signals": [{"id": s.id, "evidence": _spans(orig, [e.as_dict() for e in s.evidence])} for s in o.signals],
        "benign": {"templates": o.benign.templates, "conflict_reasons": o.benign.conflict_reasons},
        "explanation": full["explanation"],
        "key_factors": [[k["feature"], k["contribution"]] for k in full["key_factors"]],
        "semantic_terms": [[t["term"], t["contribution"]] for t in full["semantic_terms"]],
        "highlights": [[_u16(orig, h["start"]), _u16(orig, h["end"]), h["kind"], h["label"]] for h in full["highlights"]],
    }
    return rec


def corpus() -> list[tuple[str, str]]:
    d = pd.read_parquet(DATA / "dataset.parquet")
    items = [("test", t) for t in d[d.split == "test"].text]
    items += [("val", t) for t in d[d.split == "val"].sample(500, random_state=7).text]
    items += [("test_b", t) for t in pd.read_parquet(DATA / "test_b.parquet").text]
    items += [("adversarial", t) for t in pd.read_parquet(DATA / "adversarial_test.parquet").sample(1000, random_state=7).text]
    ex = json.loads((BACKEND_DATA / "examples.json").read_text(encoding="utf-8"))["examples"]
    items += [("examples", e["text"]) for e in ex]
    items += [("edge", t) for t in EDGE_CASES]
    return items


def main() -> int:
    model = TekmeModel.load()
    OUT.mkdir(parents=True, exist_ok=True)
    items = corpus()
    with (OUT / "corpus.jsonl").open("w", encoding="utf-8") as f:
        for i, (src, text) in enumerate(items):
            rec = reference(model, text)
            rec["source"] = src
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            if i % 500 == 0:
                print(f"{i}/{len(items)}", flush=True)
    print(f"wrote {len(items)} reference records")
    return 0


if __name__ == "__main__":
    sys.exit(main())
