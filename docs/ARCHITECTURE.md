# Architecture

TEKMĒ has **one model and two verified implementations**: Python trains, evaluates and serves as the reference;
TypeScript runs the same model in the browser for every user-facing feature.

```
                         ┌──────────────────── Python (training & reference) ────────────────────┐
 public datasets ──► ml/datasets/prepare.py ─► augment.py ─► ml/training/train.py ─► tekme_bundle.joblib
                         │  backend/preprocessing  backend/engines (tactics, trust, benign, semantic, fusion,     │
                         │  categorizer)  backend/explainability  →  ml/evaluation/evaluate.py → reports/*      │
                         └───────────────────────────────────────────────────────────────────────────────────────┘
                                   │ ml/export/export_web.py                │ ml/export/parity.py
                                   ▼                                        ▼
        frontend/public/model/model.bin + model.json      ml/artifacts/parity/corpus.jsonl (5,072 reference outputs)
        frontend/src/engine/generated/rules.json                            │
                                   │                                        │ frontend/tests/parity.test.ts
                                   ▼                                        ▼
 ┌──────────────────────────── Browser (runtime, on-device) ─────────────────────────────┐
 │ engine/      preprocess · tactics · trust · benign · textmodel (TF-IDF+LR) · fusion ·   │
 │              explain · engine.ts (Engine.load verifies SHA-256 of model.bin)            │
 │ analysis/    analyze.ts (shared Analysis contract) · forensics · guidance ·             │
 │              explainHinglish · intel (unfamiliarity, families) · conversation ·         │
 │              counterfactual · mutations · batch · redact · store (local only)           │
 │ pages/       Home · Analyzer · Conversation · Forensics · Lab · Model Intelligence ·    │
 │              Batch · Library · Privacy · iPhone · Settings · About                       │
 │ PWA          manifest + service worker (precache list generated at build)              │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
 Optional: backend/main.py (FastAPI, 127.0.0.1) serves the build and the original /predict API; network guard on.
 ios/: SwiftUI app + IdentityLookup Message Filter extension + compact model (ml/export/ios_model.py). Unverified.
```

## Inference pipeline (identical in Python and TypeScript)
1. **Preprocess** — remove invisible characters, map look-alike letters, NFKC, de-leet (vocabulary-checked),
   merge spaced letters, collapse repeats, expand SMS abbreviations and Hinglish spellings; keep an offset map to
   the original text; extract URLs, phones, UPI IDs, e-mails, amounts, codes; build model text with masks and
   English glosses for Hinglish/Devanagari words.
2. **Rule engines** — Scam DNA tactics (10), trust signals (links, brand/domain mismatch, contacts, amounts,
   obfuscation), genuine-message templates and conflict detection.
3. **Text models** — semantic word(1–2)+char_wb(2–5) TF-IDF logistic regression; transactional specialist.
4. **Fusion** — standardised logistic regression over 47 features, isotonic calibration; threshold 0.5.
5. **Category** — multinomial LR over text + tactic tokens; OTHER fallback below 0.5.
6. **Explanation** — templates + exact fusion contributions + highlight spans.

## Analysis layer (browser)
`analysis/analyze.ts` turns one engine prediction into the `Analysis` object every page renders:
verdict / display verdict (UNCERTAIN rule, DECISIONS D24), familiarity, link forensics, payment forensics, brand
claims, sender indicators, deterministic guidance (EN/Hinglish) and Hinglish explanation. These layers **describe
evidence; they never change the model's verdict.**

## Why the regexes are generated
Python's `\b`, `\w`, `\d`, `\s` and `$` are Unicode-aware; JavaScript's are not. `ml/export/pyregex.py` rewrites
each Python pattern with explicit `\p{L}\p{N}` classes and lookarounds, and refuses anything it cannot translate.
Code-point vs UTF-16 differences are handled in `engine/py.ts` (windows and lengths measured in code points).

## Storage
Browser `localStorage` keys `tekme:settings` (no message text), `tekme:history` (off by default, retention 1/7/30
days), `tekme:feedback`; Cache Storage `tekme-<version>` (app files and model only). All deletable in the Privacy Center.
