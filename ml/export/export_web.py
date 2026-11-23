"""Export the trained bundle + rule engines for the in-browser (on-device) engine.

Outputs (all generated from ``ml/artifacts/scamprint_bundle.joblib`` and the Python rule modules):

* ``frontend/public/model/model.bin``  - string table + float32 idf / coefficient arrays
* ``frontend/public/model/model.json`` - manifest: array offsets, intercepts, fusion / calibration, metadata
* ``frontend/src/engine/generated/rules.json`` - every regex (translated by ``pyregex``) and word list

Nothing here is hand-copied: if a Python rule changes, re-running this script updates the browser engine,
and ``ml/export/parity.py`` + the frontend parity test prove both engines still agree.

Usage:  python -m ml.export.export_web
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import joblib
import numpy as np

from backend.core.config import CATEGORY_LABELS, MODEL_BUNDLE, ROOT
from backend.engines import benign_protection as bp
from backend.engines import fusion, tactics, trust_signals
from backend.explainability import explainer
from backend.preprocessing import hinglish, lexicon, normalizer, obfuscation, patterns
from backend.services import mutations
from ml.export.pyregex import export as rx

OUT_MODEL = ROOT / "frontend" / "public" / "model"
OUT_RULES = ROOT / "frontend" / "src" / "engine" / "generated"


class Blob:
    """Concatenated little-endian arrays, 8-byte aligned, described by a manifest."""

    def __init__(self) -> None:
        self.parts: list[bytes] = []
        self.size = 0

    def add(self, arr: np.ndarray, dtype: str) -> dict:
        a = np.ascontiguousarray(arr, dtype=dtype)
        pad = (-self.size) % 8
        if pad:
            self.parts.append(b"\0" * pad)
            self.size += pad
        ref = {"offset": self.size, "length": int(a.size), "dtype": dtype}
        b = a.astype(a.dtype.newbyteorder("<")).tobytes()
        self.parts.append(b)
        self.size += len(b)
        return ref

    def add_strings(self, strings: list[str]) -> dict:
        for s in strings:
            if "\n" in s:
                raise ValueError("term contains a newline")
        b = "\n".join(strings).encode("utf-8")
        pad = (-self.size) % 8
        if pad:
            self.parts.append(b"\0" * pad)
            self.size += pad
        ref = {"offset": self.size, "bytes": len(b), "count": len(strings), "dtype": "utf8-lines"}
        self.parts.append(b)
        self.size += len(b)
        return ref


def _vectorizer(vec, blob: Blob, table: dict[str, int]) -> tuple[dict, list[int]]:
    """Returns the vectoriser spec and, for each column, the index into the shared string table."""
    p = vec.get_params()
    if p["lowercase"] is not True or vec.strip_accents is not None or vec.norm != "l2" or not vec.use_idf \
            or vec.stop_words is not None or vec.preprocessor is not None or vec.tokenizer is not None:
        raise ValueError(f"unsupported vectoriser settings: {p}")
    if vec.analyzer == "word" and vec.token_pattern != r"(?u)\b\w+\b":
        raise ValueError(f"unsupported token pattern {vec.token_pattern}")
    n = len(vec.vocabulary_)
    terms = [None] * n
    for t, j in vec.vocabulary_.items():
        terms[j] = t
    cols = []
    for t in terms:
        if t not in table:
            table[t] = len(table)
        cols.append(table[t])
    spec = {
        "analyzer": vec.analyzer, "ngram_range": list(vec.ngram_range), "sublinear_tf": bool(vec.sublinear_tf),
        "n_features": n, "idf": blob.add(vec.idf_, "<f4"),
    }
    return spec, cols


def _linear_text_model(name: str, pipeline, blob: Blob, table: dict[str, int]) -> dict:
    union = pipeline.named_steps["vec"]
    clf = pipeline.named_steps["clf"]
    if getattr(union, "transformer_weights", None):
        raise ValueError("transformer weights unsupported")
    parts, all_cols = [], []
    for part_name, vec in union.transformer_list:
        spec, cols = _vectorizer(vec, blob, table)
        spec["name"] = part_name
        parts.append(spec)
        all_cols.extend(cols)
    coef = np.asarray(clf.coef_, dtype=float)
    out = {
        "name": name, "parts": parts,
        "terms": blob.add(np.array(all_cols, dtype=np.uint32), "<u4"),
        "coef": blob.add(coef.reshape(-1), "<f4"), "coef_shape": list(coef.shape),
        "intercept": [float(x) for x in np.ravel(clf.intercept_)],
    }
    if hasattr(clf, "classes_"):
        out["classes"] = [str(c) for c in clf.classes_]
    return out


def _fusion(fm) -> dict:
    cal = fm.calibrator
    c = {"method": cal.method} if cal else None
    if cal and cal.method == "isotonic":
        iso = cal.iso
        if iso.out_of_bounds != "clip":
            raise ValueError("isotonic must clip")
        c.update({"x": [float(v) for v in iso.X_thresholds_], "y": [float(v) for v in iso.y_thresholds_]})
    elif cal:
        c.update({"a": cal.a, "b": cal.b})
    return {
        "groups": fm.groups, "names": fm.names,
        "mean": [float(v) for v in fm.scaler.mean_], "scale": [float(v) for v in fm.scaler.scale_],
        "coef": [float(v) for v in fm.clf.coef_[0]], "intercept": float(fm.clf.intercept_[0]),
        "calibrator": c,
    }


def _patterns_of(module) -> dict[str, dict]:
    return {k: rx(v) for k, v in vars(module).items() if isinstance(v, re.Pattern)}


def build_rules() -> dict:
    vocab = sorted(lexicon.vocabulary())
    brands = trust_signals.brands()
    return {
        "patterns": _patterns_of(patterns),
        "normalizer": {**_patterns_of(normalizer), "ACRONYMS": sorted(normalizer._ACRONYMS)},
        "obfuscation": {
            **_patterns_of(obfuscation),
            "INVISIBLE": sorted(obfuscation.INVISIBLE), "INDIC_SAFE": sorted(obfuscation._INDIC_SAFE),
            "CONFUSABLES": obfuscation.CONFUSABLES, "LEET": obfuscation.LEET,
        },
        "hinglish": {
            **_patterns_of(hinglish),
            "ABBREVIATIONS": hinglish.ABBREVIATIONS, "VARIANT_MAP": hinglish.VARIANT_MAP, "GLOSS": hinglish.GLOSS,
            "HINGLISH_MARKERS": sorted(hinglish._HINGLISH_MARKERS),
            "REGIONAL_MARKERS": sorted(hinglish._REGIONAL_MARKERS),
        },
        "vocabulary": vocab,
        "shorteners": sorted(patterns.SHORTENERS), "suspicious_tlds": sorted(patterns.SUSPICIOUS_TLDS),
        "two_level_suffixes": sorted(patterns.TWO_LEVEL_SUFFIXES),
        "tactics": {
            **_patterns_of(tactics),
            "list": [{"id": t.id, "label": t.label, "description": t.description, "needs_context": t.needs_context,
                      "cues": [rx(c) for c in t.cues]} for t in tactics.TACTICS],
        },
        "benign": {
            **_patterns_of(bp),
            "TEMPLATES": {k: {"description": d, "patterns": [rx(p) for p in pats]} for k, (d, pats) in bp.TEMPLATES.items()},
        },
        "trust": _patterns_of(trust_signals),
        "brands": brands,
        "explainer": {
            "TACTIC_PHRASES": explainer.TACTIC_PHRASES, "SIGNAL_PHRASES": explainer.SIGNAL_PHRASES,
            "FEATURE_LABELS": fusion.FEATURE_LABELS,
        },
        "category_labels": CATEGORY_LABELS,
        "mutations": {
            "TARGET_WORDS": sorted(mutations.TARGET_WORDS), "LEET_MAP": mutations.LEET_MAP,
            "HOMOGLYPHS": mutations.HOMOGLYPHS,
            "ABBREV": [[rx(re.compile(p, re.IGNORECASE)), r] for p, r in mutations.ABBREV],
            "HINGLISH": [[rx(re.compile(p, re.IGNORECASE)), r] for p, r in mutations.HINGLISH],
            "MUTATION_TYPES": mutations.MUTATION_TYPES,
        },
    }


def main() -> int:
    bundle = joblib.load(MODEL_BUNDLE)
    OUT_MODEL.mkdir(parents=True, exist_ok=True)
    OUT_RULES.mkdir(parents=True, exist_ok=True)
    blob = Blob()
    table: dict[str, int] = {}
    models = {
        "semantic": _linear_text_model("semantic", bundle["semantic"], blob, table),
        "specialist": _linear_text_model("specialist", bundle["specialist"], blob, table),
        "category": _linear_text_model("category", bundle["category"].pipeline, blob, table),
    }
    strings = [None] * len(table)
    for t, i in table.items():
        strings[i] = t
    string_ref = blob.add_strings(strings)
    data = b"".join(blob.parts)
    meta = bundle.get("metadata", {})
    manifest = {
        "format": "tekme-web-model/1",
        "source_bundle_sha256": hashlib.sha256(Path(MODEL_BUNDLE).read_bytes()).hexdigest(),
        "model_bin_sha256": hashlib.sha256(data).hexdigest(),
        "model_bin_bytes": len(data),
        "model_version": meta.get("model_version"), "trained_at": meta.get("trained_at"),
        "strings": string_ref, "models": models,
        "fusion": _fusion(bundle["fusion"]),
        "ablations": {k: _fusion(v) for k, v in bundle["ablations"].items()},
        "category_other_threshold": float(bundle["category"].other_threshold),
        "threshold": float(bundle["threshold"]),
        "borderline_band": [float(x) for x in bundle.get("borderline_band", (0.35, 0.65))],
        "precision_note": "idf and coefficients are stored as float32; arithmetic runs in float64.",
    }
    (OUT_MODEL / "model.bin").write_bytes(data)
    (OUT_MODEL / "model.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    rules = build_rules()
    (OUT_RULES / "rules.json").write_text(json.dumps(rules, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"model.bin {len(data) / 1e6:.2f} MB, {len(strings)} strings; rules.json "
          f"{(OUT_RULES / 'rules.json').stat().st_size / 1e3:.0f} kB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
