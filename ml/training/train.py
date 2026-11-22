"""Train every SCAMPRINT model and save a single local bundle.

Data discipline
---------------
* train (+ train-only augmentation): fit all models
* val:  model selection, fusion C, calibration, threshold, category threshold
* test: NOT touched here (see ml/evaluation/evaluate.py)

Stacking: the fusion model sees only *out-of-fold* semantic / specialist scores
(GroupKFold by template_group, vectorisers refit per fold).

Usage: python ml/training/train.py
"""
from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.base import clone
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (brier_score_loss, f1_score, log_loss, precision_score, recall_score,
                             roc_auc_score, confusion_matrix)
from sklearn.model_selection import GroupKFold
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.engines import semantic  # noqa: E402
from backend.engines.categorizer import CategoryModel, category_text, make_pipeline as make_cat  # noqa: E402
from backend.engines.fusion import ABLATIONS, Calibrator, FusionModel, expected_calibration_error  # noqa: E402
from backend.preprocessing import lexicon  # noqa: E402
from backend.services.inference import run_engines  # noqa: E402

PROC = ROOT / "ml" / "datasets" / "processed"
ART = ROOT / "ml" / "artifacts"
REPORTS = ROOT / "reports"
SEED = 13
N_FOLDS = 5


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def featurize(df: pd.DataFrame, name: str) -> pd.DataFrame:
    t0 = time.perf_counter()
    outs = [run_engines(t) for t in df.text]
    feats = pd.DataFrame([o.features for o in outs], index=df.index)
    feats["model_text"] = [o.pre.model_text for o in outs]
    feats["tactic_ids"] = [" ".join(h.id for h in o.tactic_hits) for o in outs]
    feats["transactional"] = [o.transactional for o in outs]
    print(f"  featurised {name}: {len(df)} rows in {time.perf_counter() - t0:.1f}s")
    return feats


def binary_metrics(y, p, t=0.5) -> dict:
    yhat = (p >= t).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, yhat, labels=[0, 1]).ravel()
    return {"roc_auc": round(roc_auc_score(y, p), 4), "f1": round(f1_score(y, yhat), 4),
            "precision": round(precision_score(y, yhat, zero_division=0), 4),
            "recall": round(recall_score(y, yhat), 4), "fpr": round(fp / max(fp + tn, 1), 4),
            "brier": round(brier_score_loss(y, p), 4), "ece": round(expected_calibration_error(p, y), 4),
            "log_loss": round(log_loss(y, np.clip(p, 1e-6, 1 - 1e-6)), 4)}


def oof_scores(texts: np.ndarray, y: np.ndarray, groups: np.ndarray, factory) -> np.ndarray:
    out = np.zeros(len(texts))
    for k, (tr, te) in enumerate(GroupKFold(n_splits=N_FOLDS).split(texts, y, groups)):
        m = factory().fit(list(texts[tr]), y[tr])
        out[te] = semantic.decision(m, list(texts[te]))
    return out


def choose_calibration(z: np.ndarray, y: np.ndarray) -> tuple[str, dict]:
    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(z))
    halves = [idx[: len(z) // 2], idx[len(z) // 2:]]
    scores = {}
    for method in ("sigmoid", "isotonic"):
        b = []
        for a, c in ((0, 1), (1, 0)):
            cal = Calibrator.fit(z[halves[a]], y[halves[a]], method)
            b.append(brier_score_loss(y[halves[c]], cal(z[halves[c]])))
        scores[method] = round(float(np.mean(b)), 5)
    return min(scores, key=scores.get), scores


def main() -> None:
    t_start = time.perf_counter()
    REPORTS.mkdir(exist_ok=True)
    ART.mkdir(exist_ok=True)
    lexicon.reset_cache()
    if not (ART / "vocab.txt").exists():
        raise SystemExit("vocab.txt missing - run ml/datasets/augment.py first")

    df = pd.read_parquet(PROC / "dataset.parquet")
    aug = pd.read_parquet(PROC / "train_augmented.parquet")
    train = pd.concat([df[df.split == "train"], aug[df.columns.intersection(aug.columns)]], ignore_index=True)
    val = df[df.split == "val"].reset_index(drop=True)
    print(f"train(+aug)={len(train)}  val={len(val)}")

    print("[1/7] engine features")
    ftr = featurize(train, "train")
    fva = featurize(val, "val")
    ytr = (train.binary_label == "SCAM").astype(int).to_numpy()
    yva = (val.binary_label == "SCAM").astype(int).to_numpy()
    Xtr_text = ftr.model_text.to_numpy()
    Xva_text = fva.model_text.to_numpy()
    groups = train.template_group.to_numpy()

    # ---------------------------------------------------------- semantic model selection
    print("[2/7] semantic model selection (fit on train, scored on val)")
    vec = semantic.make_vectorizer().fit(list(Xtr_text))
    A, B = vec.transform(list(Xtr_text)), vec.transform(list(Xva_text))
    cands = [("logreg", {"C": c}) for c in (1.0, 4.0, 16.0)] + \
            [("linear_svm", {"C": c}) for c in (0.1, 0.5)] + \
            [("complement_nb", {"alpha": a}) for a in (0.1, 0.5)]
    selection = []
    for kind, hp in cands:
        t0 = time.perf_counter()
        if kind == "logreg":
            clf = LogisticRegression(C=hp["C"], class_weight="balanced", max_iter=4000, solver="liblinear")
        elif kind == "linear_svm":
            clf = LinearSVC(C=hp["C"], class_weight="balanced")
        else:
            clf = ComplementNB(alpha=hp["alpha"])
        clf.fit(A, ytr)
        fit_s = time.perf_counter() - t0
        s = semantic.decision(Pipeline([("vec", vec), ("clf", clf)]), list(Xva_text))
        thr = 0.0
        yhat = (s >= thr).astype(int)
        tn, fp, fn, tp = confusion_matrix(yva, yhat).ravel()
        row = {"model": kind, **hp, "val_roc_auc": round(roc_auc_score(yva, s), 4),
               "val_f1": round(f1_score(yva, yhat), 4), "val_recall": round(tp / (tp + fn), 4),
               "val_fpr": round(fp / (fp + tn), 4), "fit_seconds": round(fit_s, 2)}
        selection.append(row)
        print("   ", row)
    best = max(selection, key=lambda r: (r["val_roc_auc"], r["val_f1"]))
    lr_rows = [r for r in selection if r["model"] == "logreg"]
    best_lr = max(lr_rows, key=lambda r: (r["val_roc_auc"], r["val_f1"]))
    # prefer LR (exact, faithful explanations) unless another family is clearly better
    chosen = best_lr if best_lr["val_roc_auc"] >= best["val_roc_auc"] - 0.003 else best
    print("   chosen:", chosen)
    sem_factory = (lambda: semantic.make_model(chosen["model"], C=chosen.get("C", 1.0), alpha=chosen.get("alpha", 0.3)))

    # ---------------------------------------------------------- OOF semantic + specialist
    print("[3/7] out-of-fold scores for stacking")
    sem_oof = oof_scores(Xtr_text, ytr, groups, sem_factory)
    tx = ftr.transactional.to_numpy()
    spec_factory = lambda: semantic.make_model("logreg", C=chosen.get("C", 4.0) if chosen["model"] == "logreg" else 4.0)
    spec_oof = np.zeros(len(train))
    spec_oof[tx] = oof_scores(Xtr_text[tx], ytr[tx], groups[tx], spec_factory)
    print(f"   specialist subset: {int(tx.sum())} transactional training rows "
          f"({ytr[tx].mean():.1%} scam)")

    sem_full = sem_factory().fit(list(Xtr_text), ytr)
    spec_full = spec_factory().fit(list(Xtr_text[tx]), ytr[tx])

    def rows_for(feats: pd.DataFrame, sem_s, spec_s) -> list[dict]:
        base = feats.drop(columns=["model_text", "tactic_ids", "transactional"]).to_dict("records")
        out = []
        for r, s, sp, ap in zip(base, sem_s, spec_s, feats.transactional):
            out.append({**r, "sem_logit": float(s), "spec_logit": float(sp) if ap else 0.0,
                        "spec_applicable": float(ap)})
        return out

    rows_tr = rows_for(ftr, sem_oof, spec_oof)
    rows_va = rows_for(fva, semantic.decision(sem_full, list(Xva_text)), semantic.decision(spec_full, list(Xva_text)))

    # ---------------------------------------------------------- fusion + ablations + calibration
    print("[4/7] fusion, ablations, calibration")
    fusions = {}
    fusion_report = {}
    for name, grp in ABLATIONS.items():
        best_c, best_auc = None, -1
        for C in (0.1, 1.0, 10.0):
            fm = FusionModel.fit(rows_tr, ytr, grp, C=C)
            auc = roc_auc_score(yva, fm.logit(rows_va))
            if auc > best_auc:
                best_c, best_auc = C, auc
        fm = FusionModel.fit(rows_tr, ytr, grp, C=best_c)
        z = fm.logit(rows_va)
        method, cal_scores = choose_calibration(z, yva)
        fm.calibrator = Calibrator.fit(z, yva, method)
        p_raw = 1 / (1 + np.exp(-z))
        p_cal = fm.calibrator(z)
        fusions[name] = fm
        fusion_report[name] = {"C": best_c, "calibration": method, "calibration_cv_brier": cal_scores,
                               "val_uncalibrated": binary_metrics(yva, p_raw),
                               "val_calibrated_in_sample": binary_metrics(yva, p_cal)}
        print(f"   {name}: C={best_c} cal={method} val_auc={best_auc:.4f}")
    final = fusions["E_full_hybrid"]

    # ---------------------------------------------------------- threshold
    print("[5/7] threshold selection on val")
    p_va = final.proba(rows_va)
    sweep = []
    for t in np.round(np.arange(0.20, 0.81, 0.05), 2):
        yhat = (p_va >= t).astype(int)
        tn, fp, fn, tp = confusion_matrix(yva, yhat).ravel()
        sweep.append({"threshold": float(t), "f1": round(f1_score(yva, yhat), 4), "recall": round(tp / (tp + fn), 4),
                      "fpr": round(fp / (fp + tn), 4), "precision": round(tp / max(tp + fp, 1), 4)})
    # The threshold is fixed at 0.5 on the CALIBRATED probability so that the verdict is always the
    # more probable class and "confidence" (= calibrated P(verdict)) is always >= 0.5. Any other cut-off
    # would label messages SAFE while their own calibrated scam probability exceeds 50% (or vice versa).
    # The sweep above is recorded so the recall/FPR trade-off of other thresholds stays visible.
    threshold = 0.5
    at_half = next(s for s in sweep if abs(s["threshold"] - 0.5) < 1e-9)
    print(f"   threshold=0.5 (consistency rule); val at 0.5: {at_half}")

    # ---------------------------------------------------------- category model
    print("[6/7] category model")
    sc_tr = train.binary_label == "SCAM"
    sc_va = (val.binary_label == "SCAM") & (val.category_source == "source_label")
    ct_tr = [category_text(m, t.split()) for m, t in zip(ftr.model_text[sc_tr], ftr.tactic_ids[sc_tr])]
    ct_va = [category_text(m, t.split()) for m, t in zip(fva.model_text[sc_va], fva.tactic_ids[sc_va])]
    ycat_tr = train.scam_category[sc_tr].to_numpy()
    ycat_va = val.scam_category[sc_va].to_numpy()
    cat_search = []
    best_cat = None
    for C in (1.0, 4.0, 16.0):
        pipe = make_cat(C).fit(ct_tr, ycat_tr)
        for tau in (0.0, 0.3, 0.4, 0.5, 0.6):
            cm = CategoryModel(pipe, tau)
            pred = [c for c, _, _ in cm.predict(ct_va)]
            mf1 = f1_score(ycat_va, pred, average="macro")
            cat_search.append({"C": C, "other_threshold": tau, "val_macro_f1": round(mf1, 4)})
            if best_cat is None or mf1 > best_cat[0]:
                best_cat = (mf1, C, tau, pipe)
    print(f"   best category: C={best_cat[1]} tau={best_cat[2]} val macro-F1={best_cat[0]:.4f}")
    category = CategoryModel(best_cat[3], best_cat[2])

    # ---------------------------------------------------------- save bundle
    print("[7/7] saving bundle")
    meta = {
        "model_version": "scamprint-1.0",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "training_seconds": round(time.perf_counter() - t_start, 1),
        "python": platform.python_version(), "sklearn": sklearn.__version__,
        "dataset_sha256": sha256(PROC / "dataset.parquet"),
        "train_rows": int(len(train)), "train_augmented_rows": int(len(aug)), "val_rows": int(len(val)),
        "semantic_model": chosen, "specialist_rows": int(tx.sum()),
        "fusion": fusion_report["E_full_hybrid"], "threshold": threshold,
        "category": {"C": best_cat[1], "other_threshold": best_cat[2], "val_macro_f1": round(best_cat[0], 4)},
        "feature_count": len(final.names),
    }
    bundle = {"semantic": sem_full, "specialist": spec_full, "fusion": final, "ablations": fusions,
              "category": category, "threshold": threshold, "borderline_band": (0.35, 0.65), "metadata": meta}
    joblib.dump(bundle, ART / "scamprint_bundle.joblib", compress=3)
    train_report = {"metadata": meta, "semantic_selection": selection, "fusion_and_ablations": fusion_report,
                    "threshold_sweep_val": sweep, "threshold_rule": "fixed 0.5 on calibrated probability (verdict = more probable class); sweep reported for transparency",
                    "category_search": cat_search,
                    "fusion_coefficients": dict(zip(final.names, np.round(final.clf.coef_[0], 4).tolist()))}
    (REPORTS / "training_report.json").write_text(json.dumps(train_report, indent=2), encoding="utf-8")
    print(f"done in {time.perf_counter() - t_start:.0f}s -> {ART / 'scamprint_bundle.joblib'}")


if __name__ == "__main__":
    main()
