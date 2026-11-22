# SCAMPRINT architecture

## Runtime data flow

```
 Browser (React UI, served from 127.0.0.1:8000)
   │  POST /predict {text}            ← loopback only, never leaves the computer
   ▼
 FastAPI (backend/main.py) ── network guard: socket.connect to non-loopback ⇒ blocked
   │
   ▼  backend/services/inference.py  (ONE code path for training, evaluation and the API)
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │ 1. Preprocessing  backend/preprocessing/                                       │
 │    original text ─► clean_chars (invisible chars, homoglyphs, NFKC)            │
 │                  ─► entity spans protected (URL, UPI, e-mail, phone)           │
 │                  ─► token transforms: spaced letters, repeats, leet (vocab-     │
 │                     checked), abbreviations, Hinglish spelling variants        │
 │                  ─► normalized text + offset map back to original              │
 │                  ─► model_text: entities masked (xurlx…), lower-case, glosses  │
 │ 2. Rule engines   backend/engines/                                             │
 │    tactics.py          10 Scam-DNA tactics with evidence spans + strength       │
 │    trust_signals.py    offline URL/phone/UPI/money/OTP/obfuscation features     │
 │    benign_protection   genuine-message templates, safety advice, conflicts      │
 │ 3. Statistical models                                                          │
 │    semantic.py         word+char TF-IDF → LogisticRegression (all messages)     │
 │    specialist          same, trained only on transactional-looking messages     │
 │ 4. fusion.py           StandardScaler + LogisticRegression over 47 features     │
 │                        → calibrator (isotonic/sigmoid, fit on validation)       │
 │                        → verdict = SCAM if P ≥ 0.5; confidence = P(verdict)     │
 │ 5. categorizer.py      multinomial LR (text + tactic tokens), OTHER fallback    │
 │ 6. explainer.py        exact fusion contributions + rule evidence → sentences   │
 └────────────────────────────────────────────────────────────────────────────────┘
   │
   ▼  JSON response (verdict, category, confidence, tactics, signals, highlights, explanation)
```

## Training pipeline (`scripts/train_all.ps1`)

```
download_data.py  → pinned revisions, SHA-256 verified       (development only, needs internet)
prepare.py        → unify schema, category mapping, PII masking, dedup, near-dup groups,
                    group-aware split, leakage audit, external Test B          → dataset.parquet
augment.py        → train-only, class-balanced augmentation; adversarial test set; vocab.txt
train.py          → features; semantic model selection on val; GroupKFold OOF scores;
                    specialist; fusion + 5 ablation variants; calibration; category model
                    → ml/artifacts/scamprint_bundle.joblib
evaluate.py       → test, Test B, subsets, adversarial, ablation, latency/memory
                    → reports/metrics.json (read by the UI), evaluation_report.md, figures/
```

## Data separation

| Split | Used for |
|---|---|
| train (+ augmentation) | fitting vectorisers, semantic/specialist/fusion/category models (OOF for stacking) |
| val | model selection, fusion C, calibration method + fit, category threshold |
| test | final evaluation only (never seen during development decisions after the split) |
| Test B (external) | final evaluation only; near-duplicates of train removed |
| adversarial set | mutations of test messages; 6 of 11 mutation types never used for augmentation |

## Repository layout

```
backend/   main.py, api/ (routes, schemas), core/ (config, privacy), preprocessing/, engines/,
           explainability/, services/ (inference, mutations), data/ (official_domains.json, examples.json)
ml/        datasets/ (prepare, augment; raw/ and processed/ are git-ignored), training/, evaluation/, artifacts/
frontend/  React + TypeScript + Tailwind (src/pages: Analyzer, MutationLab, Diagnostics, Privacy, About)
tests/     unit/, integration/, privacy/, adversarial/, performance/
reports/   generated metrics, reports and figures
docs/      this documentation
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + model loaded |
| GET | `/model/info` | bundle metadata (training date, rows, threshold, size) |
| POST | `/predict` | full analysis of one message (≤ 2,000 chars) |
| POST | `/mutate` | generate mutations only |
| POST | `/evaluate-mutations` | mutations + batched predictions + consistency/accuracy summary |
| GET | `/mutation-types` | available mutation types (and which were used in training) |
| GET | `/metrics` | saved evaluation results (`reports/metrics.json`) |
| GET | `/privacy/status` | local files + hashes, guard state, live external sockets |
| GET | `/examples` | illustrative demo inputs |

All routes are also available under `/api/…` (used by the UI). The machine-readable schema is at
`/openapi.json`. FastAPI's `/docs` and `/redoc` pages are **disabled** because they load JavaScript from a public CDN.
