"""Training-set augmentation and the independent adversarial evaluation set.

* Augmentation is applied to the TRAIN split only, after splitting. Each variant
  inherits its parent's ``template_group`` so group-aware CV keeps parent and
  children in the same fold. Both classes are augmented at the same rate, so
  "obfuscated" or "Hinglish" never becomes a label shortcut.
* The adversarial set mutates TEST messages with all 11 Mutation-Lab types,
  including 6 types never used for augmentation (held-out transformations).

Also writes the corpus vocabulary (train split only) used by the de-obfuscator.
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.services.mutations import MUTATION_TYPES, TRAIN_AUGMENT_TYPES, mutate  # noqa: E402

PROC = ROOT / "ml" / "datasets" / "processed"
ARTIFACTS = ROOT / "ml" / "artifacts"
REPORTS = ROOT / "reports"
SEED = 7
RATES = {"hinglish": 0.12, "char_substitution": 0.04, "spacing": 0.03, "mixed_case": 0.03, "abbreviation": 0.04}
ADV_PER_CLASS = 500


def build_vocab(train_texts: list[str]) -> list[str]:
    c = collections.Counter()
    for t in train_texts:
        c.update(w for w in re.findall(r"[a-z]{3,}", t.lower()))
    return sorted(w for w, n in c.items() if n >= 3)


def main() -> None:
    df = pd.read_parquet(PROC / "dataset.parquet")
    train = df[df.split == "train"]
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    vocab = build_vocab(train.text.tolist())
    (ARTIFACTS / "vocab.txt").write_text("\n".join(vocab), encoding="utf-8")

    rng = np.random.default_rng(SEED)
    rows = []
    eligible_hi = train[train.language == "en"]
    for kind in TRAIN_AUGMENT_TYPES:
        pool = eligible_hi if kind == "hinglish" else train
        take = pool.sample(frac=RATES[kind], random_state=int(rng.integers(1e9)))
        for r in take.itertuples(index=False):
            t = mutate(r.text, kind, seed=SEED)
            if t == r.text:
                continue
            d = r._asdict()
            d.update(text=t, message_id=f"{r.message_id}_aug_{kind}", is_synthetic=True,
                     source=f"{r.source}+aug:{kind}", parent_id=r.message_id,
                     language="hinglish" if kind == "hinglish" else r.language)
            rows.append(d)
    aug = pd.DataFrame(rows)
    # balance classes within each augmentation type so no transformation becomes a label shortcut
    aug["_kind"] = aug.source.str.split("aug:").str[1]
    parts = []
    for _, g in aug.groupby("_kind"):
        n = g.binary_label.value_counts().min()
        parts.extend(g[g.binary_label == lab].sample(n, random_state=SEED) for lab in ("SAFE", "SCAM"))
    aug = pd.concat(parts).drop(columns="_kind").reset_index(drop=True)
    aug.to_parquet(PROC / "train_augmented.parquet", index=False)

    test = df[df.split == "test"]
    base = pd.concat([test[test.binary_label == lab].sample(min(ADV_PER_CLASS, (test.binary_label == lab).sum()),
                                                            random_state=SEED) for lab in ("SCAM", "SAFE")])
    adv = []
    for r in base.itertuples(index=False):
        for kind in MUTATION_TYPES:
            t = mutate(r.text, kind, seed=SEED + 1)
            adv.append(dict(message_id=f"{r.message_id}_adv_{kind}", parent_id=r.message_id, text=t,
                            original_text=r.text, mutation=kind, changed=t != r.text,
                            held_out_mutation=kind not in TRAIN_AUGMENT_TYPES,
                            binary_label=r.binary_label, scam_category=r.scam_category,
                            category_source=r.category_source, language=r.language, source=r.source))
    adv = pd.DataFrame(adv)
    adv.to_parquet(PROC / "adversarial_test.parquet", index=False)

    rep = {
        "vocab_size": len(vocab),
        "augmented_rows": int(len(aug)),
        "augmented_by_type_label": aug.groupby([aug.source.str.split("aug:").str[1], "binary_label"]).size()
                                      .unstack(fill_value=0).to_dict("index"),
        "adversarial_rows": int(len(adv)),
        "adversarial_base_messages": int(len(base)),
        "adversarial_changed_share": round(float(adv.changed.mean()), 4),
        "held_out_mutation_types": [k for k in MUTATION_TYPES if k not in TRAIN_AUGMENT_TYPES],
    }
    (REPORTS / "augmentation_report.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
