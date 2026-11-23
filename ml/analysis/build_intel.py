"""Model-intelligence artefacts for TEKMĒ: scam families, unfamiliar-message detection, source comparison.

Everything is fitted on the TRAINING split only. Validation is used to fix the unfamiliarity thresholds;
test, Test B and the adversarial set are only *measured*, never used for fitting or threshold choice.

Outputs
* ``frontend/public/model/intel.json`` - centroids (sparse), thresholds, scam families, source comparison
* ``reports/intel_report.json``         - measured behaviour of the unfamiliarity flag on held-out data

Usage:  python -m ml.analysis.build_intel
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import Counter

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import MiniBatchKMeans
from sklearn.preprocessing import normalize

from backend.core.config import CATEGORY_LABELS, MODEL_BUNDLE, ROOT
from backend.engines import tactics
from backend.preprocessing.normalizer import preprocess
from backend.preprocessing.patterns import EMAIL_RE, LONG_NUMBER_RE, PHONE_RE, PLACEHOLDER_RE, UPI_RE, sub_urls

DATA = ROOT / "ml" / "datasets" / "processed"
OUT = ROOT / "frontend" / "public" / "model" / "intel.json"
REPORT = ROOT / "reports" / "intel_report.json"
K = 40
TOP = 400  # non-zero weights kept per centroid
SEED = 7
SOURCE_INFO = {
    "scam_shield/mishra_soni": {"label": "Mishra & Soni SMS phishing dataset", "published": 2022, "kind": "collected"},
    "scam_shield/imc2025": {"label": "IMC 2025 public smishing reports", "published": 2025, "kind": "collected (user reports)"},
    "scam_shield/synthetic": {"label": "Scam Shield synthetic", "published": 2025, "kind": "LLM-generated"},
    "scam_shield/synthetic_v2": {"label": "Scam Shield synthetic v2", "published": 2025, "kind": "LLM-generated"},
    "indian_synthetic": {"label": "Indian scam SMS (synthetic, audited)", "published": 2025, "kind": "LLM-generated"},
}


def redact(text: str) -> str:
    t = PLACEHOLDER_RE.sub(lambda m: {"<URL>": "[link]", "<PHONE_NUMBER>": "[phone]", "<EMAIL_ADDRESS>": "[email]",
                                      "<NUMBER>": "[number]"}[m.group(0)], text)
    t = sub_urls("[link]", t)
    t = UPI_RE.sub("[upi-id]", t)
    t = EMAIL_RE.sub("[email]", t)
    t = PHONE_RE.sub("[phone]", t)
    t = LONG_NUMBER_RE.sub("[number]", t)
    return re.sub(r"\s+", " ", t).strip()


def vectors(vec, texts: list[str]):
    return normalize(vec.transform(texts))  # l2 over the concatenated word+char row


def sparsify(c: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    idx = np.argsort(-c)[:TOP]
    idx = idx[c[idx] > 0]
    v = c[idx] / np.linalg.norm(c[idx])
    order = np.argsort(idx)
    return idx[order].astype(np.int64), v[order]


def similarity(X, cents: list[tuple[np.ndarray, np.ndarray]]) -> tuple[np.ndarray, np.ndarray]:
    dense = np.zeros((len(cents), X.shape[1]))
    for k, (i, v) in enumerate(cents):
        dense[k, i] = v
    S = np.asarray((X @ dense.T))
    return S.max(axis=1), S.argmax(axis=1)


def coverage(word_vocab: dict, model_texts: list[str]) -> np.ndarray:
    tok = re.compile(r"(?u)\b\w+\b")
    out = []
    for t in model_texts:
        ws = tok.findall(t.lower())
        out.append(sum(w in word_vocab for w in ws) / len(ws) if ws else 0.0)
    return np.array(out)


def main() -> int:
    t0 = time.perf_counter()
    bundle = joblib.load(MODEL_BUNDLE)
    sem = bundle["semantic"]
    vec = sem.named_steps["vec"]
    word_vocab = vec.transformer_list[0][1].vocabulary_
    d = pd.read_parquet(DATA / "dataset.parquet")
    tr = d[d.split == "train"].reset_index(drop=True)
    va = d[d.split == "val"].reset_index(drop=True)
    te = d[d.split == "test"].reset_index(drop=True)
    tb = pd.read_parquet(DATA / "test_b.parquet")
    adv = pd.read_parquet(DATA / "adversarial_test.parquet").sample(2000, random_state=SEED)

    def prep(df):
        return [preprocess(t) for t in df.text]

    pre_tr, pre_va, pre_te, pre_tb, pre_adv = prep(tr), prep(va), prep(te), prep(tb), prep(adv)
    mt = lambda ps: [p.model_text for p in ps]  # noqa: E731
    Xtr = vectors(vec, mt(pre_tr))
    km = MiniBatchKMeans(n_clusters=K, random_state=SEED, batch_size=2048, n_init=5, max_iter=300).fit(Xtr)
    cents = [sparsify(c) for c in km.cluster_centers_]
    sim_tr, lab_tr = similarity(Xtr, cents)

    # Unfamiliarity thresholds: 5th percentile on VALIDATION.
    sim_va, _ = similarity(vectors(vec, mt(pre_va)), cents)
    cov_va = coverage(word_vocab, mt(pre_va))
    th_sim = float(np.quantile(sim_va, 0.05))
    th_cov = float(np.quantile(cov_va, 0.05))

    # Measure (not tune) on held-out sets, using the model's own predictions.
    from backend.services.inference import ScamPrint
    model = ScamPrint.load()

    def measure(df, ps, name):
        s, _ = similarity(vectors(vec, mt(ps)), cents)
        c = coverage(word_vocab, mt(ps))
        flag = (s < th_sim) | (c < th_cov)
        preds = model.predict_batch(list(df.text), with_category=False)
        correct = np.array([p["verdict"] == y for p, y in zip(preds, df.binary_label)])
        conf = np.array([p["confidence"] for p in preds])
        r = {"set": name, "n": int(len(df)), "flagged": int(flag.sum()), "flagged_share": round(float(flag.mean()), 4),
             "accuracy_flagged": round(float(correct[flag].mean()), 4) if flag.any() else None,
             "accuracy_not_flagged": round(float(correct[~flag].mean()), 4) if (~flag).any() else None,
             "mean_confidence_flagged": round(float(conf[flag].mean()), 4) if flag.any() else None,
             "mean_confidence_not_flagged": round(float(conf[~flag].mean()), 4) if (~flag).any() else None}
        return r, s, c

    measured = []
    parity = []
    for df, ps, name in ((te, pre_te, "test"), (tb, pre_tb, "test_b"), (adv, pre_adv, "adversarial_sample")):
        r, s, c = measure(df, ps, name)
        measured.append(r)
        if name == "test":
            for i in range(0, len(df), max(1, len(df) // 40)):
                parity.append({"text": df.text.iloc[i], "similarity": float(s[i]), "coverage": float(c[i])})

    # Scam families = clusters dominated by scam training messages.
    hits_tr = [tactics.detect(p) for p in pre_tr]
    families = []
    names = [n for n, _ in vec.transformer_list]
    word_n = len(word_vocab)
    inv_word = {j: t for t, j in word_vocab.items()}
    for k in range(K):
        m = lab_tr == k
        n = int(m.sum())
        if n == 0:
            continue
        y = (tr.binary_label.values[m] == "SCAM").astype(float)
        scam_share = float(y.mean())
        c = km.cluster_centers_[k][:word_n]
        top = [inv_word[j] for j in np.argsort(-c)[:40] if not re.fullmatch(r"x\w+x|\d+", inv_word[j])][:8]
        cats = Counter(cat for cat, src in zip(tr.scam_category.values[m], tr.category_source.values[m])
                       if isinstance(cat, str) and cat and src != "weak_rule" and cat != "None")
        tac = Counter(h.id for i in np.where(m)[0] for h in hits_tr[i])
        srcs = Counter(tr.source.values[m])
        idx = np.where(m)[0]
        order = idx[np.argsort(-sim_tr[idx])]
        reps, seen = [], set()
        for i in order:
            r = redact(tr.text.iloc[i])
            key = r.lower()[:60]
            if key in seen or len(r) < 25:
                continue
            seen.add(key)
            reps.append({"text": r[:220], "synthetic": bool(tr.is_synthetic.iloc[i])})
            if len(reps) == 3:
                break
        families.append({
            "cluster": k, "size": n, "scam_share": round(scam_share, 3), "is_scam_family": scam_share >= 0.8 and n >= 30,
            "top_terms": top,
            "dominant_category": (cats.most_common(1)[0][0] if cats else None),
            "category_counts": dict(cats.most_common()),
            "tactic_share": {t: round(v / n, 3) for t, v in tac.most_common(5)},
            "sources": dict(srcs.most_common()),
            "synthetic_share": round(float(tr.is_synthetic.values[m].mean()), 3),
            "examples": reps,
        })

    # Source comparison (scam messages only, training split).
    comparison = []
    for src, info in SOURCE_INFO.items():
        m = ((tr.source == src) & (tr.binary_label == "SCAM")).values
        n = int(m.sum())
        if n < 30:
            continue
        tac = Counter(h.id for i in np.where(m)[0] for h in hits_tr[i])
        has_url = float(np.mean([bool(pre_tr[i].urls or pre_tr[i].placeholders.get("url")) for i in np.where(m)[0]]))
        comparison.append({"source": src, **info, "n_scam_messages": n,
                           "tactic_share": {t: round(tac.get(t, 0) / n, 3) for t in tactics.TACTIC_IDS},
                           "link_share": round(has_url, 3)})

    out = {
        "format": "tekme-intel/1",
        "fitted_on": "training split only (thresholds from validation)",
        "k": K, "top_per_centroid": TOP,
        "centroids": [{"cols": c[0].tolist(), "vals": [round(float(v), 6) for v in c[1]]} for c in cents],
        "unfamiliar": {"similarity_threshold": th_sim, "coverage_threshold": th_cov,
                       "rule": "flag when similarity to every training cluster OR known-vocabulary coverage is below the validation 5th percentile",
                       "measured": measured},
        "families": families,
        "source_comparison": {"note": "Differences between documented collections, ordered by publication year. The data carries no "
                                      "per-message dates, so this is NOT a measured trend over time; synthetic sources reflect how "
                                      "they were generated.", "rows": comparison},
        "category_labels": CATEGORY_LABELS,
    }
    # Raw test messages used for the browser parity check stay out of the shipped file (git-ignored folder).
    (ROOT / "ml" / "artifacts" / "parity").mkdir(parents=True, exist_ok=True)
    (ROOT / "ml" / "artifacts" / "parity" / "intel_samples.json").write_text(json.dumps(parity, ensure_ascii=False), encoding="utf-8")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    REPORT.write_text(json.dumps({"unfamiliar": out["unfamiliar"], "n_families": sum(f["is_scam_family"] for f in families),
                                  "seconds": round(time.perf_counter() - t0, 1)}, indent=1), encoding="utf-8")
    print(json.dumps(out["unfamiliar"], indent=1))
    print("scam families:", sum(f["is_scam_family"] for f in families), f"{OUT.stat().st_size / 1e3:.0f} kB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
