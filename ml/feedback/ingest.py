"""Controlled intake of user feedback exported from the TEKMĒ web app (Privacy Center → Export).

This script NEVER retrains or modifies the deployed model. It validates the export and appends the items to
``ml/datasets/feedback/feedback_review.csv`` with ``status=needs_review``. A person must review each row
(set status to ``approved`` or ``rejected``). Using approved rows for training is a separate, manual step that
must be followed by the full pipeline (``scripts/train_all.ps1``) so every metric is re-measured; feedback rows
must never be added to the test split or Test B.

Usage:  python -m ml.feedback.ingest path/to/tekme-feedback.json
"""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path

from backend.core.config import ROOT

OUT = ROOT / "ml" / "datasets" / "feedback" / "feedback_review.csv"
FIELDS = ["id", "exported_at", "text", "user_label", "predicted", "scam_probability", "model_version", "redacted", "status", "note"]


def validate(doc: dict) -> list[dict]:
    if doc.get("format") != "tekme-feedback/1":
        raise ValueError("not a TEKMĒ feedback export (format tekme-feedback/1 expected)")
    items = doc.get("items")
    if not isinstance(items, list):
        raise ValueError("items must be a list")
    out = []
    for i, it in enumerate(items):
        text = it.get("text")
        label = it.get("user_label")
        if not isinstance(text, str) or not text.strip() or len(text) > 2000:
            raise ValueError(f"item {i}: text missing or longer than 2000 characters")
        if label not in ("SCAM", "SAFE"):
            raise ValueError(f"item {i}: user_label must be SCAM or SAFE")
        out.append(it)
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    doc = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    items = validate(doc)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    if OUT.exists():
        with OUT.open(encoding="utf-8", newline="") as f:
            seen = {r["id"] for r in csv.DictReader(f)}
    new = 0
    with OUT.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if not seen and f.tell() == 0:
            w.writeheader()
        for it in items:
            rid = hashlib.sha256((it["text"] + it["user_label"]).encode("utf-8")).hexdigest()[:16]
            if rid in seen:
                continue
            seen.add(rid)
            w.writerow({"id": rid, "exported_at": doc.get("exported_at", ""), "text": it["text"], "user_label": it["user_label"],
                        "predicted": it.get("predicted", ""), "scam_probability": it.get("scam_probability", ""),
                        "model_version": it.get("model_version", ""), "redacted": doc.get("redacted", False),
                        "status": "needs_review", "note": it.get("note", "")})
            new += 1
    wrong = sum(1 for it in items if it.get("predicted") and it["predicted"] != it["user_label"])
    print(f"{len(items)} items validated, {new} new rows added to {OUT.relative_to(ROOT)} (status=needs_review); "
          f"{wrong} disagree with the model. The deployed model was not changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
