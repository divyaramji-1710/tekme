"""Reproducible evaluation of the saved bundle on untouched data.

Uses ``backend.services.inference.TekmeModel`` - the exact code path the API
serves - so reported numbers describe the shipped application.

Outputs: reports/metrics.json (read by the UI), reports/evaluation_report.md,
         reports/error_analysis.md, reports/figures/*.png
Usage:   python ml/evaluation/evaluate.py
"""
from __future__ import annotations

import gc
import json
import re
import sys
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import psutil  # noqa: E402
from sklearn.metrics import (accuracy_score, brier_score_loss, classification_report, confusion_matrix,  # noqa: E402
                             f1_score, precision_score, recall_score, roc_auc_score)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.core.config import CATEGORIES, MODEL_BUNDLE  # noqa: E402
from backend.engines.categorizer import category_text  # noqa: E402
from backend.engines.fusion import ABLATIONS, expected_calibration_error  # noqa: E402

PROC = ROOT / "ml" / "datasets" / "processed"
REPORTS = ROOT / "reports"
FIG = REPORTS / "figures"
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e6e5e0", "#fcfcfb"
BLUE, ORANGE, GOOD, CRIT = "#2a78d6", "#eb6834", "#0ca30c", "#d03b3b"

OTP_RE = re.compile(r"\b(?:otp|one[\s-]time\s+password|verification\s+code)\b", re.I)
BANK_RE = re.compile(r"\b(?:debited|credited|a/c|acct|account\s+(?:no|ending|xx)|avl\s*bal|balance|bank)\b", re.I)
DELIV_RE = re.compile(r"\b(?:order|parcel|package|shipment|delivery|courier|shipped|dispatched|delivered)\b", re.I)
URL_RE = re.compile(r"<URL>|https?://|www\.|\b[a-z0-9-]+\.(?:com|in|co|net|org|ly|me|io)\b", re.I)


def binary(y: np.ndarray, p: np.ndarray, t: float) -> dict:
    yhat = (p >= t).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, yhat, labels=[0, 1]).ravel()
    out = {"n": int(len(y)), "n_scam": int(y.sum()), "n_safe": int((1 - y).sum()),
           "accuracy": round(accuracy_score(y, yhat), 4),
           "precision": round(precision_score(y, yhat, zero_division=0), 4),
           "recall": round(recall_score(y, yhat, zero_division=0), 4),
           "f1": round(f1_score(y, yhat, zero_division=0), 4),
           "macro_f1": round(f1_score(y, yhat, average="macro", zero_division=0), 4),
           "false_positive_rate": round(fp / max(fp + tn, 1), 4),
           "false_negative_rate": round(fn / max(fn + tp, 1), 4),
           "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}
    if 0 < y.sum() < len(y):
        out["roc_auc"] = round(roc_auc_score(y, p), 4)
        out["brier"] = round(brier_score_loss(y, p), 4)
        out["ece_scam_prob"] = round(expected_calibration_error(p, y), 4)
    conf = np.where(yhat == 1, p, 1 - p)
    out["ece_confidence"] = round(expected_calibration_error(conf, (yhat == y).astype(int)), 4)
    out["mean_confidence"] = round(float(conf.mean()), 4)
    return out


def subset_rate(y, p, t) -> dict:
    """For single-class subsets: share predicted correctly + share flagged."""
    yhat = (p >= t).astype(int)
    return {"n": int(len(y)), "accuracy": round(float((yhat == y).mean()), 4) if len(y) else None,
            "flagged_as_scam": round(float(yhat.mean()), 4) if len(y) else None}


def reliability(p: np.ndarray, y: np.ndarray, bins: int = 10) -> list[dict]:
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & ((p < hi) if hi < 1 else (p <= hi))
        out.append({"bin_low": round(lo, 2), "bin_high": round(hi, 2), "count": int(m.sum()),
                    "mean_predicted": round(float(p[m].mean()), 4) if m.any() else None,
                    "observed_scam_rate": round(float(y[m].mean()), 4) if m.any() else None})
    return out


def style(ax, title):
    ax.set_facecolor(SURF)
    ax.set_title(title, color=INK, fontsize=11, loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def plot_confusion(cm: dict, path: Path, title: str):
    fig, ax = plt.subplots(figsize=(4.2, 3.6), facecolor=SURF)
    M = np.array([[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]])
    ax.imshow(M, cmap="Blues")
    for (i, j), v in np.ndenumerate(M):
        ax.text(j, i, str(v), ha="center", va="center", color="white" if v > M.max() / 2 else INK, fontsize=12)
    ax.set_xticks([0, 1], ["Pred SAFE", "Pred SCAM"])
    ax.set_yticks([0, 1], ["True SAFE", "True SCAM"])
    ax.set_title(title, color=INK, fontsize=11, loc="left")
    ax.tick_params(colors=INK2)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_reliability(rel: list[dict], path: Path):
    fig, ax = plt.subplots(figsize=(4.8, 4.2), facecolor=SURF)
    style(ax, "Reliability diagram (test)")
    ax.plot([0, 1], [0, 1], color=INK2, linewidth=1, linestyle="--", label="Perfect calibration")
    xs = [r["mean_predicted"] for r in rel if r["count"]]
    ys = [r["observed_scam_rate"] for r in rel if r["count"]]
    ax.plot(xs, ys, color=BLUE, linewidth=2, marker="o", markersize=6, label="TEKMĒ")
    ax.set_xlabel("Predicted scam probability", color=INK2)
    ax.set_ylabel("Observed scam rate", color=INK2)
    ax.legend(frameon=False, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_bars(labels, values, path, title, xlabel, color=BLUE, xlim=(0, 1)):
    fig, ax = plt.subplots(figsize=(6.4, 0.42 * len(labels) + 1.2), facecolor=SURF)
    style(ax, title)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.grid(axis="y", visible=False)
    y = np.arange(len(labels))
    ax.barh(y, values, color=color, height=0.6)
    for yi, v in zip(y, values):
        ax.text(v + 0.005, yi, f"{v:.3f}", va="center", fontsize=8, color=INK2)
    ax.set_yticks(y, labels)
    ax.invert_yaxis()
    ax.set_xlim(*xlim)
    ax.set_xlabel(xlabel, color=INK2)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    REPORTS.mkdir(exist_ok=True)
    FIG.mkdir(exist_ok=True)
    proc = psutil.Process()
    gc.collect()
    rss0 = proc.memory_info().rss
    from backend.services.inference import TekmeModel
    t0 = time.perf_counter()
    model = TekmeModel.load(MODEL_BUNDLE)
    load_s = time.perf_counter() - t0
    rss1 = proc.memory_info().rss
    t = model.threshold
    ablations = model.bundle["ablations"]

    df = pd.read_parquet(PROC / "dataset.parquet")
    test = df[df.split == "test"].reset_index(drop=True)
    tb = pd.read_parquet(PROC / "test_b.parquet")
    adv = pd.read_parquet(PROC / "adversarial_test.parquet")

    def score(texts):
        p, outs, rows = model.scam_probability(list(texts))
        return p, outs, rows

    print("scoring test ...")
    p_te, outs_te, rows_te = score(test.text)
    y_te = (test.binary_label == "SCAM").astype(int).to_numpy()
    m = {"model": model.info(), "threshold": t}
    m["test"] = binary(y_te, p_te, t)
    m["test"]["reliability"] = reliability(p_te, y_te)

    # ---- per source / language
    m["test_by_source"] = {s: binary(y_te[g.index], p_te[g.index], t) for s, g in test.groupby("source")}
    m["test_by_language"] = {}
    for lang, g in test.groupby("language"):
        m["test_by_language"][lang] = binary(y_te[g.index], p_te[g.index], t)

    # ---- special subsets
    has_url = np.array([bool(o.pre.urls or o.pre.placeholders.get("url")) for o in outs_te])
    safe = y_te == 0
    subsets = {
        "genuine_otp": safe & test.text.str.contains(OTP_RE).to_numpy(),
        "genuine_bank_notifications": safe & test.text.str.contains(BANK_RE).to_numpy(),
        "genuine_delivery_notifications": safe & test.text.str.contains(DELIV_RE).to_numpy(),
        "genuine_with_links": safe & has_url,
        "genuine_personal_chat": safe & test.source.isin(["scam_shield/mishra_soni", "uci_sms_spam"]).to_numpy(),
    }
    gold = (test.category_source == "source_label").to_numpy()
    for cat in ("KYC_BANK", "LOAN_CREDIT", "LOTTERY_PRIZE", "JOB_INVESTMENT", "OTHER"):
        subsets[f"scam_{cat.lower()}"] = (y_te == 1) & gold & (test.scam_category == cat).to_numpy()
    for lang in ("en", "hinglish", "hi", "regional_mixed"):
        subsets[f"lang_{lang}"] = (test.language == lang).to_numpy()
    m["subsets"] = {}
    for k, mask in subsets.items():
        if mask.sum() == 0:
            m["subsets"][k] = {"n": 0}
            continue
        if k.startswith("lang_"):
            m["subsets"][k] = binary(y_te[mask], p_te[mask], t)
        else:
            m["subsets"][k] = subset_rate(y_te[mask], p_te[mask], t)

    # ---- categories (gold-labelled scams only; detection-independent and end-to-end)
    sc = (y_te == 1) & gold
    ctexts = [category_text(outs_te[i].pre.model_text, [h.id for h in outs_te[i].tactic_hits]) for i in np.where(sc)[0]]
    cpred = [c for c, _, _ in model.category.predict(ctexts)]
    ctrue = test.scam_category[sc].tolist()
    rep = classification_report(ctrue, cpred, labels=CATEGORIES, output_dict=True, zero_division=0)
    cm_cat = confusion_matrix(ctrue, cpred, labels=CATEGORIES).tolist()
    preds_te = model.predict_batch(test.text.tolist())
    safe_with_cat = sum(1 for pr in preds_te if pr["verdict"] == "SAFE" and pr["category"] is not None)
    m["category"] = {"n_gold_scams": int(sc.sum()), "macro_f1": round(rep["macro avg"]["f1-score"], 4),
                     "accuracy": round(rep["accuracy"], 4) if "accuracy" in rep else round(float(np.mean(np.array(ctrue) == np.array(cpred))), 4),
                     "per_class": {c: {k: round(v, 4) for k, v in rep[c].items()} for c in CATEGORIES},
                     "confusion_matrix": {"labels": CATEGORIES, "matrix": cm_cat},
                     "safe_predictions_with_category": safe_with_cat,
                     "note": "Evaluated on test scams whose category comes from the source dataset (weak-rule labels excluded)."}

    # ---- ablation
    print("ablations ...")
    m["ablation"] = {}
    p_tb_full, outs_tb, rows_tb = score(tb.text)
    y_tb = (tb.binary_label == "SCAM").astype(int).to_numpy()
    adv_s = adv.sample(min(len(adv), 4400), random_state=1) if len(adv) > 4400 else adv
    p_adv_full, _, rows_adv = score(adv_s.text)
    y_adv = (adv_s.binary_label == "SCAM").astype(int).to_numpy()
    for name, fm in ablations.items():
        m["ablation"][name] = {"groups": ABLATIONS[name],
                               "test": binary(y_te, fm.proba(rows_te), 0.5),
                               "test_b": binary(y_tb, fm.proba(rows_tb), 0.5),
                               "adversarial_sample": binary(y_adv, fm.proba(rows_adv), 0.5)}
        for k in ("test", "test_b", "adversarial_sample"):
            m["ablation"][name][k].pop("confusion_matrix", None)

    # ---- external Test B
    m["test_b"] = binary(y_tb, p_tb_full, t)
    m["test_b_by_difficulty"] = {d: binary(y_tb[g.index], p_tb_full[g.index], t) for d, g in tb.groupby("difficulty")}
    m["subsets"]["borderline_test_b_hard"] = m["test_b_by_difficulty"].get("hard", {"n": 0})

    # ---- adversarial robustness (full set)
    print("adversarial ...")
    p_adv, _, _ = score(adv.text)
    y_a = (adv.binary_label == "SCAM").astype(int).to_numpy()
    base_ids = adv.parent_id.unique()
    base_txt = adv.drop_duplicates("parent_id").set_index("parent_id").original_text
    p_base, _, _ = score(base_txt.loc[base_ids].tolist())
    base_pred = dict(zip(base_ids, (p_base >= t).astype(int)))
    adv = adv.assign(p=p_adv, pred=(p_adv >= t).astype(int), y=y_a)
    adv["flip"] = adv.pred != adv.parent_id.map(base_pred)
    rob = {}
    yb = np.array([1 if l == "SCAM" else 0 for l in adv.drop_duplicates("parent_id").set_index("parent_id").binary_label.loc[base_ids]])
    pb = (p_base >= t).astype(int)
    rob["unmutated_baseline"] = {"scam_recall": round(float(pb[yb == 1].mean()), 4),
                                 "safe_specificity": round(float(1 - pb[yb == 0].mean()), 4), "n": int(len(yb))}
    for kind, g in adv.groupby("mutation"):
        rob[kind] = {"held_out": bool(g.held_out_mutation.iat[0]), "n": int(len(g)),
                     "text_changed_share": round(float(g.changed.mean()), 4),
                     "scam_recall": round(float(g[g.y == 1].pred.mean()), 4),
                     "safe_specificity": round(float(1 - g[g.y == 0].pred.mean()), 4),
                     "accuracy": round(float((g.pred == g.y).mean()), 4),
                     "verdict_flip_rate": round(float(g.flip.mean()), 4)}
    m["adversarial"] = rob
    m["adversarial_overall"] = binary(y_a, p_adv, t)

    # ---- latency & memory
    print("latency ...")
    sample = test.text.sample(200, random_state=3).tolist()
    model.predict(sample[0])
    lat = []
    for s in sample:
        t1 = time.perf_counter()
        model.predict(s)
        lat.append((time.perf_counter() - t1) * 1000)
    t1 = time.perf_counter()
    model.predict_batch(test.text.tolist()[:1000], with_category=True)
    batch_ms = (time.perf_counter() - t1) * 1000 / 1000
    m["performance"] = {"model_load_seconds": round(load_s, 3), "bundle_size_mb": round(MODEL_BUNDLE.stat().st_size / 1e6, 2),
                        "rss_increase_after_load_mb": round((rss1 - rss0) / 1e6, 1),
                        "process_rss_mb": round(proc.memory_info().rss / 1e6, 1),
                        "single_predict_ms": {"mean": round(float(np.mean(lat)), 2), "p50": round(float(np.percentile(lat, 50)), 2),
                                              "p95": round(float(np.percentile(lat, 95)), 2), "max": round(float(np.max(lat)), 2)},
                        "batch_ms_per_message": round(batch_ms, 3), "device": "CPU only",
                        "cpu": "13th Gen Intel Core i7-1355U (measured machine)"}

    # ---- errors
    errs = test.assign(p=p_te, y=y_te)
    fps = errs[(errs.y == 0) & (errs.p >= t)].sort_values("p", ascending=False).head(15)
    fns = errs[(errs.y == 1) & (errs.p < t)].sort_values("p").head(15)
    m["error_counts"] = {"false_positives": int(((errs.y == 0) & (errs.p >= t)).sum()),
                         "false_negatives": int(((errs.y == 1) & (errs.p < t)).sum())}
    m["generated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    (REPORTS / "metrics.json").write_text(json.dumps(m, indent=2, default=float), encoding="utf-8")

    # ---- figures
    plot_confusion(m["test"]["confusion_matrix"], FIG / "confusion_test.png", "Confusion matrix (test)")
    plot_confusion(m["test_b"]["confusion_matrix"], FIG / "confusion_test_b.png", "Confusion matrix (external Test B)")
    plot_reliability(m["test"]["reliability"], FIG / "reliability_test.png")
    kinds = [k for k in rob if k != "unmutated_baseline"]
    plot_bars([f"{k}{' *' if rob[k]['held_out'] else ''}" for k in kinds], [rob[k]["accuracy"] for k in kinds],
              FIG / "robustness.png", "Accuracy under mutation (test-derived; * = never used in training)", "Accuracy")
    names = list(m["ablation"])
    plot_bars(names, [m["ablation"][n]["test"]["f1"] for n in names], FIG / "ablation_test_f1.png",
              "Ablation - F1 on test", "F1", xlim=(0.8, 1.0))
    plot_bars(names, [m["ablation"][n]["test"]["false_positive_rate"] for n in names], FIG / "ablation_test_fpr.png",
              "Ablation - false-positive rate on test (lower is better)", "FPR", color=ORANGE, xlim=(0, 0.08))

    write_error_analysis(fps, fns, t)
    write_report(m)
    print(json.dumps({"test": {k: m["test"][k] for k in ("accuracy", "precision", "recall", "f1", "false_positive_rate",
                                                         "roc_auc", "brier", "ece_scam_prob")},
                      "test_b": {k: m["test_b"][k] for k in ("accuracy", "f1", "false_positive_rate", "recall")},
                      "category_macro_f1": m["category"]["macro_f1"]}, indent=1))


def _clip(s: str, n: int = 160) -> str:
    s = s.replace("|", "/").replace("\n", " ")
    return s if len(s) <= n else s[:n] + "..."


def write_error_analysis(fps, fns, t):
    lines = ["# Error analysis (test split)", "",
             "_Highest-scoring false positives and lowest-scoring false negatives, generated by `ml/evaluation/evaluate.py`._", "",
             f"Decision threshold: {t}", "", "## False positives (genuine messages flagged as SCAM)", "",
             "| scam prob | source | text |", "|---|---|---|"]
    lines += [f"| {r.p:.3f} | {r.source} | {_clip(r.text)} |" for r in fps.itertuples()]
    lines += ["", "## False negatives (scams classified SAFE)", "", "| scam prob | source | text |", "|---|---|---|"]
    lines += [f"| {r.p:.3f} | {r.source} | {_clip(r.text)} |" for r in fns.itertuples()]
    (REPORTS / "error_analysis.md").write_text("\n".join(lines), encoding="utf-8")


def _row(name, d, keys):
    return f"| {name} | " + " | ".join("" if d.get(k) is None else (f"{d[k]:.4f}" if isinstance(d[k], float) else str(d[k])) for k in keys) + " |"


def write_report(m: dict) -> None:
    K = ["n", "accuracy", "precision", "recall", "f1", "macro_f1", "false_positive_rate", "false_negative_rate", "roc_auc", "brier", "ece_scam_prob"]
    hdr = "| set | " + " | ".join(K) + " |\n|---|" + "---|" * len(K)
    L = ["# Evaluation report", "", f"_Generated {m['generated_at']} by `ml/evaluation/evaluate.py` from the saved bundle; "
         "every number is computed from actual predictions._", "",
         f"Decision threshold on calibrated scam probability: **{m['threshold']}**", "",
         "## Headline", hdr, _row("Test (untouched)", m["test"], K), _row("External Test B", m["test_b"], K),
         _row("Adversarial (all mutations)", m["adversarial_overall"], K), "",
         "![confusion](figures/confusion_test.png) ![reliability](figures/reliability_test.png)", "",
         "## By source (test)", hdr] + [_row(s, d, K) for s, d in m["test_by_source"].items()] + [
         "", "## By language (test)", hdr] + [_row(s, d, K) for s, d in m["test_by_language"].items()] + [
         "", "## Special subsets", "Genuine-message subsets report `flagged_as_scam` (= false-positive rate within the subset); "
         "scam subsets report `accuracy` (= recall within the subset).", "",
         "| subset | n | accuracy | flagged_as_scam |", "|---|---|---|---|"]
    for k, d in m["subsets"].items():
        if "flagged_as_scam" in d or d.get("n") == 0:
            L.append(f"| {k} | {d.get('n')} | {d.get('accuracy')} | {d.get('flagged_as_scam')} |")
        else:
            L.append(f"| {k} | {d['n']} | {d['accuracy']} | FPR {d['false_positive_rate']} / recall {d['recall']} |")
    c = m["category"]
    L += ["", "## Scam categories (gold-labelled test scams)", f"n = {c['n_gold_scams']}, macro-F1 = **{c['macro_f1']}**, "
          f"accuracy = {c['accuracy']}; SAFE predictions carrying a category: {c['safe_predictions_with_category']}", "",
          "| category | precision | recall | f1 | support |", "|---|---|---|---|---|"]
    L += [f"| {k} | {v['precision']} | {v['recall']} | {v['f1-score']} | {int(v['support'])} |" for k, v in c["per_class"].items()]
    L += ["", "Confusion matrix (rows = true, cols = predicted): " + ", ".join(CATEGORIES), "```"]
    L += [str(r) for r in c["confusion_matrix"]["matrix"]] + ["```", "", "## Ablation (threshold 0.5, each variant calibrated on val)",
          "| variant | test F1 | test FPR | test recall | test AUC | test ECE | Test B F1 | Test B FPR | adversarial F1 |", "|---|---|---|---|---|---|---|---|---|"]
    for n, d in m["ablation"].items():
        L.append(f"| {n} | {d['test']['f1']} | {d['test']['false_positive_rate']} | {d['test']['recall']} | {d['test'].get('roc_auc')} | "
                 f"{d['test'].get('ece_scam_prob')} | {d['test_b']['f1']} | {d['test_b']['false_positive_rate']} | {d['adversarial_sample']['f1']} |")
    L += ["", "![ablation](figures/ablation_test_f1.png) ![ablation fpr](figures/ablation_test_fpr.png)", "",
          "## Adversarial robustness (mutations of test messages; * held out from training augmentation)",
          "| mutation | held out | n | text changed | scam recall | safe specificity | accuracy | verdict flip rate |", "|---|---|---|---|---|---|---|---|"]
    for k, d in m["adversarial"].items():
        if k == "unmutated_baseline":
            L.append(f"| (unmutated) | | {d['n']} | | {d['scam_recall']} | {d['safe_specificity']} | | |")
        else:
            L.append(f"| {k} | {'*' if d['held_out'] else ''} | {d['n']} | {d['text_changed_share']} | {d['scam_recall']} | "
                     f"{d['safe_specificity']} | {d['accuracy']} | {d['verdict_flip_rate']} |")
    p = m["performance"]
    L += ["", "![robustness](figures/robustness.png)", "", "## Performance (CPU)", "```", json.dumps(p, indent=2), "```",
          "", f"Errors on test: {m['error_counts']} - see `error_analysis.md`."]
    (REPORTS / "evaluation_report.md").write_text("\n".join(L), encoding="utf-8")


if __name__ == "__main__":
    main()
