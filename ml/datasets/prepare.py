"""Build the unified, leakage-safe SCAMPRINT dataset.

Pipeline
--------
1. Load the four public sources (see scripts/download_data.py) into one schema.
2. Map source subtypes to the five required scam categories; where a source has
   no usable subtype, apply a documented keyword *weak labeller* and record
   ``category_source = weak_rule`` so evaluation can exclude those rows.
3. Mask phone numbers / e-mails in personal (SAFE, non-service) messages.
4. Exact-duplicate removal on a normalised key; drop keys with conflicting labels.
5. Near-duplicate clustering (char 3-5 gram TF-IDF, cosine >= 0.8, union-find)
   -> ``template_group``.
6. Group-aware split. Real Scam-Shield messages keep their published split
   (val/test are real messages only). Everything else is split 70/15/15 by
   group. Any training row whose group touches val/test is dropped.
7. Cross-split leakage audit (nearest neighbour similarity test->train).
8. Test B (external, unseen) is kept separate and de-duplicated against train.

Outputs: ml/datasets/processed/{dataset.parquet, test_b.parquet},
         reports/dataset_report.{json,md}
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.preprocessing.hinglish import detect_language  # noqa: E402
from backend.preprocessing.patterns import EMAIL_RE, PHONE_RE  # noqa: E402

RAW = ROOT / "ml" / "datasets" / "raw"
OUT = ROOT / "ml" / "datasets" / "processed"
REPORTS = ROOT / "reports"
SEED = 20261123

# ---------------------------------------------------------------- category maps
INDIAN_MAP = {"fake_kyc": "KYC_BANK", "fake_bank_otp": "KYC_BANK", "lottery": "LOTTERY_PRIZE",
              "loan_offer": "LOAN_CREDIT", "job_offer": "JOB_INVESTMENT", "courier_customs": "OTHER",
              "electricity_bill": "OTHER", "unknown": None}
V2_MAP = {
    **{k: "KYC_BANK" for k in ["fake_bank", "otp_theft", "account_takeover", "fake_account_alert",
                               "safe_account_scam", "pin_theft", "upi_collect_scam", "courier_card_scam",
                               "fake_mobile_money", "identity_theft", "seed_phrase_phishing"]},
    **{k: "LOTTERY_PRIZE" for k in ["fake_prize", "fake_lottery", "fake_rewards", "crypto_giveaway",
                                    "fake_survey", "fake_promo", "fake_grant", "advance_fee_fraud",
                                    "fake_settlement", "fake_claim"]},
    **{k: "LOAN_CREDIT" for k in ["fake_loan", "fake_loan_forgiveness", "fake_debt_relief",
                                  "loan_app_extortion", "fake_debt_collector"]},
    **{k: "JOB_INVESTMENT" for k in ["fake_job", "task_scam", "pig_butchering", "fake_investment",
                                     "investment_group_scam", "fake_crypto_exchange", "pyramid_scheme",
                                     "boiler_room", "money_mule"]},
}
TESTB_MAP = {
    **{k: "KYC_BANK" for k in ["bank_phishing", "otp_theft", "wallet_phishing", "account_takeover",
                               "sim_swap_phishing", "reversal_scam"]},
    **{k: "LOTTERY_PRIZE" for k in ["prize_scam", "lottery_scam", "advance_fee", "inheritance_scam",
                                    "survey_scam", "loyalty_phishing", "subsidy_scam"]},
    **{k: "JOB_INVESTMENT" for k in ["job_scam", "task_scam", "pig_butchering", "crypto_scam",
                                     "investment_scam", "mlm_scam", "money_mule"]},
}
WEAK_RULES = [  # applied in order; first match wins
    ("LOTTERY_PRIZE", r"\b(?:won|winner|winning|prize|lottery|lucky\s+draw|jackpot|sweepstake|kbc|"
                      r"congratulations|you\s+have\s+been\s+selected|claim\s+your\s+(?:reward|gift|prize|cash))\b"),
    ("JOB_INVESTMENT", r"\b(?:job|jobs|hiring|recruit\w*|vacanc\w+|part[\s-]?time|work\s+from\s+home|salary|"
                       r"invest\w*|trading|crypto\w*|bitcoin|usdt|forex|profit|returns|stock|earn\s+\d|daily\s+income)\b"),
    ("LOAN_CREDIT", r"\b(?:loan|loans|pre[\s-]?approved|credit\s+limit|emi|debt|instant\s+cash|interest\s+rate|cibil)\b"),
    ("KYC_BANK", r"\b(?:kyc|bank|banking|a/c|account|pan|aadhaa?r|debit\s+card|credit\s+card|netbanking|"
                 r"net\s+banking|upi|atm|ifsc|otp)\b"),
]
_WEAK = [(c, re.compile(p, re.IGNORECASE)) for c, p in WEAK_RULES]


def weak_category(text: str, default: str = "OTHER") -> str:
    for cat, rx in _WEAK:
        if rx.search(text):
            return cat
    return default


# ---------------------------------------------------------------- loaders
def load_sources() -> pd.DataFrame:
    rows = []
    ss = []
    for split in ("train", "val", "test"):
        d = pd.read_csv(RAW / "scam_shield_sms" / f"{split}.csv")
        d["orig_split"] = {"val": "val"}.get(split, split)
        ss.append(d)
    ss = pd.concat(ss, ignore_index=True)
    for r in ss.itertuples(index=False):
        label = "SCAM" if r.label == "scam" else "SAFE"
        st = r.scam_type if isinstance(r.scam_type, str) else ""
        cat, csrc = None, None
        if label == "SCAM":
            if r.source == "synthetic_v2":
                cat = V2_MAP.get(st, "OTHER")
                csrc = "source_label"
            elif r.source == "imc2025":
                if st == "banking":
                    cat, csrc = "KYC_BANK", "source_label"
                elif st in ("delivery", "government", "telecom", "wrong number", "hey mum/dad"):
                    cat, csrc = "OTHER", "source_label"
                else:
                    cat, csrc = weak_category(r.text), "weak_rule"
            else:
                cat, csrc = weak_category(r.text), "weak_rule"
        real = r.source in ("imc2025", "mishra_soni")
        rows.append(dict(text=r.text, binary_label=label, scam_category=cat, category_source=csrc,
                         source=f"scam_shield/{r.source}", source_subtype=st,
                         is_synthetic=not real, fixed_split=r.orig_split if real else None, language=None))

    ind = pd.read_csv(RAW / "indian_scam_synthetic" / "synthetic_audited.csv")
    lang_map = {"hinglish": "hinglish", "en": "en", "hi": "hi"}
    for r in ind.itertuples(index=False):
        label = "SCAM" if r.label == "scam" else "SAFE"
        cat, csrc = None, None
        if label == "SCAM":
            cat = INDIAN_MAP.get(r.scam_type)
            csrc = "source_label"
            if cat is None:
                cat, csrc = weak_category(r.text), "weak_rule"
        rows.append(dict(text=r.text, binary_label=label, scam_category=cat, category_source=csrc,
                         source="indian_synthetic", source_subtype=f"{r.topic}",
                         is_synthetic=True, fixed_split=None, language=lang_map.get(r.language, "regional_mixed")))

    uci = pd.read_csv(RAW / "uci_sms_spam" / "sms-spam-collection.csv")
    # Only ham is used: UCI 'spam' mixes advertising with scams, and the problem asks for
    # scam detection (Scam Shield made the same choice). See docs/DATASETS.md.
    for r in uci[uci.label == "ham"].itertuples(index=False):
        rows.append(dict(text=r.message, binary_label="SAFE", scam_category=None, category_source=None,
                         source="uci_sms_spam", source_subtype="ham", is_synthetic=False,
                         fixed_split=None, language=None))
    df = pd.DataFrame(rows)
    df["text"] = df["text"].astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    return df


def load_test_b() -> pd.DataFrame:
    d = pd.read_csv(RAW / "scam_shield_test_b" / "messages.csv")
    out = pd.DataFrame({
        "text": d["text"].astype(str).str.replace(r"\s+", " ", regex=True).str.strip(),
        "binary_label": np.where(d["label"] == "scam", "SCAM", "SAFE"),
        "source_subtype": d["category"], "country": d["country"], "difficulty": d["difficulty"],
    })
    out["scam_category"] = [
        (TESTB_MAP.get(c, "OTHER") if lab == "SCAM" else None) for c, lab in zip(d["category"], out["binary_label"])]
    out["category_source"] = np.where(out["binary_label"] == "SCAM", "source_label", None)
    out["source"] = "scam_shield_test_b"
    out["is_synthetic"] = True
    return out


# ---------------------------------------------------------------- helpers
def dedupe_key(t: str) -> str:
    t = t.lower()
    t = re.sub(r"<[a-z_]+>|https?://\S+|\d+", "#", t)
    return re.sub(r"[^a-z#ऀ-ॿ]+", "", t)


def mask_personal_pii(df: pd.DataFrame) -> int:
    """Mask phones/e-mails in genuine personal messages (privacy; consistent with Scam Shield)."""
    m = (df.binary_label == "SAFE") & df.source.isin(["uci_sms_spam", "scam_shield/mishra_soni"])
    n = 0
    texts = df.loc[m, "text"].tolist()
    new = []
    for t in texts:
        t2 = PHONE_RE.sub("<PHONE_NUMBER>", EMAIL_RE.sub("<EMAIL_ADDRESS>", t))
        n += t2 != t
        new.append(t2)
    df.loc[m, "text"] = new
    return n


class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def near_dup_groups(texts: list[str], threshold: float = 0.8) -> np.ndarray:
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True)
    X = vec.fit_transform([t.lower() for t in texts])
    nn = NearestNeighbors(radius=1 - threshold, metric="cosine", algorithm="brute")
    nn.fit(X)
    uf = UnionFind(len(texts))
    step = 2000
    for s in range(0, X.shape[0], step):
        _, idx = nn.radius_neighbors(X[s:s + step], return_distance=True)
        for i, neigh in enumerate(idx):
            for j in neigh:
                uf.union(s + i, int(j))
    return np.array([uf.find(i) for i in range(len(texts))])


def max_sim_to(train_texts, query_texts):
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True)
    vec.fit(list(train_texts) + list(query_texts))
    A = vec.transform([t.lower() for t in train_texts])
    B = vec.transform([t.lower() for t in query_texts])
    nn = NearestNeighbors(n_neighbors=1, metric="cosine", algorithm="brute").fit(A)
    d, _ = nn.kneighbors(B)
    return 1 - d[:, 0]


# ---------------------------------------------------------------- main
def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    rep: dict = {"seed": SEED}
    df = load_sources()
    rep["loaded"] = df.groupby(["source", "binary_label"]).size().unstack(fill_value=0).to_dict("index")
    rep["loaded_total"] = int(len(df))

    df = df[df.text.str.split().str.len() >= 2].copy()
    rep["pii_masked_personal_messages"] = mask_personal_pii(df)

    # ---- exact duplicates & label consistency
    df["dkey"] = df.text.map(dedupe_key)
    df = df[df.dkey.str.len() >= 4]
    conflict_keys = df.groupby("dkey").binary_label.nunique()
    conflict_keys = set(conflict_keys[conflict_keys > 1].index)
    rep["label_conflict_keys_dropped"] = len(conflict_keys)
    rep["label_conflict_rows_dropped"] = int(df.dkey.isin(conflict_keys).sum())
    df = df[~df.dkey.isin(conflict_keys)]
    # prefer rows with a fixed (published) split, then real over synthetic
    prio = {"test": 0, "val": 1, "train": 2}
    df["_p"] = df.fixed_split.map(prio).fillna(3) * 2 + df.is_synthetic.astype(int)
    before = len(df)
    df = df.sort_values("_p").drop_duplicates("dkey", keep="first").drop(columns="_p")
    rep["exact_duplicates_removed"] = int(before - len(df))
    df = df.reset_index(drop=True)

    # ---- language
    df["language"] = [l if isinstance(l, str) else detect_language(t) for l, t in zip(df.language, df.text)]

    # ---- near-duplicate template groups
    groups = near_dup_groups(df.text.tolist(), 0.8)
    df["template_group"] = [f"g{g}" for g in groups]
    gsize = df.groupby("template_group").size()
    rep["template_groups"] = int(len(gsize))
    rep["rows_in_multi_member_groups"] = int(gsize[gsize > 1].sum())

    # ---- split
    rng = np.random.default_rng(SEED)
    split = pd.Series(index=df.index, dtype=object)
    fixed = df.fixed_split.notna()
    split[fixed] = df.loc[fixed, "fixed_split"]
    group_best = df[fixed].assign(p=df.loc[fixed, "fixed_split"].map(prio)).groupby("template_group").p.min()
    inv = {v: k for k, v in prio.items()}
    inherited = df.loc[~fixed, "template_group"].map({g: inv[p] for g, p in group_best.items()})
    split[~fixed] = inherited
    # assign remaining groups 70/15/15, stratified by the group's dominant source
    g_src = df[split.isna()].groupby("template_group").source.agg(lambda s: s.mode().iat[0])
    group_split: dict[str, str] = {}
    for src, gs in g_src.groupby(g_src):
        gl = sorted(gs.index)
        rng.shuffle(gl)
        n = len(gl)
        n_test, n_val = int(round(n * 0.15)), int(round(n * 0.15))
        for i, g in enumerate(gl):
            group_split[g] = "test" if i < n_test else ("val" if i < n_test + n_val else "train")
    todo = split.isna()
    split[todo] = df.loc[todo, "template_group"].map(group_split)
    df["split"] = split
    # leakage guard: any train row whose group also appears in val/test is dropped
    eval_groups = set(df.loc[df.split.isin(["val", "test"]), "template_group"])
    leak = (df.split == "train") & df.template_group.isin(eval_groups)
    rep["train_rows_dropped_group_overlap"] = int(leak.sum())
    df = df[~leak]
    vt_overlap = set(df.loc[df.split == "val", "template_group"]) & set(df.loc[df.split == "test", "template_group"])
    leak2 = (df.split == "val") & df.template_group.isin(vt_overlap)
    rep["val_rows_dropped_group_overlap_with_test"] = int(leak2.sum())
    df = df[~leak2].reset_index(drop=True)

    # ---- leakage audit
    tr = df[df.split == "train"].text.tolist()
    te = df[df.split == "test"].text.tolist()
    sims = max_sim_to(tr, te)
    rep["leakage_audit_test_vs_train"] = {
        "max_similarity_mean": round(float(sims.mean()), 4),
        "share_ge_0.8": round(float((sims >= 0.8).mean()), 4),
        "share_ge_0.9": round(float((sims >= 0.9).mean()), 4),
        "note": "char 3-5gram TF-IDF cosine of each test message to its nearest training message",
    }

    df["message_id"] = [f"m{i:06d}" for i in range(len(df))]
    cols = ["message_id", "text", "binary_label", "scam_category", "category_source", "language", "source",
            "source_subtype", "is_synthetic", "template_group", "split"]
    df = df[cols]
    df.to_parquet(OUT / "dataset.parquet", index=False)

    # ---- external Test B
    tb = load_test_b()
    tb_sims = max_sim_to(df[df.split == "train"].text.tolist(), tb.text.tolist())
    tb["max_sim_train"] = tb_sims
    rep["test_b_removed_near_dup_ge_0.8"] = int((tb_sims >= 0.8).sum())
    tb = tb[tb_sims < 0.8].reset_index(drop=True)
    tb["language"] = tb.text.map(detect_language)
    tb["message_id"] = [f"b{i:04d}" for i in range(len(tb))]
    tb.to_parquet(OUT / "test_b.parquet", index=False)

    # ---- report
    rep["final_total"] = int(len(df))
    rep["by_split_label"] = df.groupby(["split", "binary_label"]).size().unstack(fill_value=0).to_dict("index")
    rep["by_source_split"] = df.groupby(["source", "split"]).size().unstack(fill_value=0).to_dict("index")
    rep["by_language_label"] = df.groupby(["language", "binary_label"]).size().unstack(fill_value=0).to_dict("index")
    sc = df[df.binary_label == "SCAM"]
    rep["scam_category_by_split"] = sc.groupby(["scam_category", "split"]).size().unstack(fill_value=0).to_dict("index")
    rep["category_source_counts"] = sc.category_source.value_counts().to_dict()
    rep["synthetic_share"] = round(float(df.is_synthetic.mean()), 4)
    rep["test_b"] = {"rows": int(len(tb)), "by_label": tb.binary_label.value_counts().to_dict(),
                     "by_difficulty": tb.difficulty.value_counts().to_dict()}
    (REPORTS / "dataset_report.json").write_text(json.dumps(rep, indent=2, default=str), encoding="utf-8")
    write_markdown(rep)
    print(json.dumps({k: rep[k] for k in ["loaded_total", "final_total", "by_split_label",
                                          "leakage_audit_test_vs_train", "category_source_counts"]}, indent=1))


def _table(d: dict) -> str:
    if not d:
        return "_none_\n"
    cols = sorted({c for v in d.values() for c in v})
    lines = ["| | " + " | ".join(cols) + " |", "|---|" + "---|" * len(cols)]
    for k, v in d.items():
        lines.append(f"| {k} | " + " | ".join(str(v.get(c, 0)) for c in cols) + " |")
    return "\n".join(lines) + "\n"


def write_markdown(rep: dict) -> None:
    md = ["# Dataset report", "", "_Generated by `ml/datasets/prepare.py` - all numbers computed, not hand-entered._", "",
          f"- Rows loaded: **{rep['loaded_total']}**; rows after cleaning/dedup/leak-guard: **{rep['final_total']}**",
          f"- Exact duplicates removed: {rep['exact_duplicates_removed']}",
          f"- Conflicting-label duplicate keys dropped: {rep['label_conflict_keys_dropped']} "
          f"({rep['label_conflict_rows_dropped']} rows)",
          f"- Personal messages with phone/e-mail masked: {rep['pii_masked_personal_messages']}",
          f"- Template groups (near-dup clusters, cosine >= 0.8): {rep['template_groups']} "
          f"({rep['rows_in_multi_member_groups']} rows in multi-member groups)",
          f"- Train rows dropped because their group touches val/test: {rep['train_rows_dropped_group_overlap']}",
          f"- Val rows dropped because their group touches test: {rep['val_rows_dropped_group_overlap_with_test']}",
          f"- Synthetic share: {rep['synthetic_share']:.1%}", "",
          "## Loaded by source", _table(rep["loaded"]),
          "## Final split x label", _table(rep["by_split_label"]),
          "## Source x split", _table(rep["by_source_split"]),
          "## Language x label", _table(rep["by_language_label"]),
          "## Scam category x split", _table(rep["scam_category_by_split"]),
          f"Category label provenance: {rep['category_source_counts']} "
          "(`weak_rule` rows are excluded from category evaluation).", "",
          "## Leakage audit (test vs train)", "```", json.dumps(rep["leakage_audit_test_vs_train"], indent=2), "```",
          "## External Test B",
          f"{rep['test_b']} (removed {rep['test_b_removed_near_dup_ge_0.8']} near-duplicates of training data)", ""]
    (REPORTS / "dataset_report.md").write_text("\n".join(md), encoding="utf-8")


if __name__ == "__main__":
    main()
