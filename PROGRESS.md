# Progress

**Current phase:** complete prototype (Checkpoints 0–19). Checkpoint 14 is PARTIAL only because the physical
Wi-Fi-off demonstration needs to be done by the user.
**Last updated:** 2026-11-23

## Completed and verified
* Data pipeline: download (pinned + SHA-256) → prepare (25,421 rows, group-aware split, leakage audit) → augment
  (3,760 train-only rows; 11,000-row adversarial set) → train (~5.5 min) → evaluate (~4 min).
* Models: semantic LR, transactional specialist, calibrated fusion (47 features, isotonic), category LR, five
  ablation variants, all in `ml/artifacts/scamprint_bundle.joblib` (7.9 MB).
* Test results: acc 0.950, F1 0.946, FPR 0.039, AUC 0.988, ECE 0.007; Test B acc 0.885; adversarial acc 0.947.
* Backend: FastAPI with every requested endpoint, under `/` and `/api`; network guard; no message logging.
* Frontend: Analyzer, Scam DNA, Mutation Lab, Model Diagnostics, Privacy Center, About; served by the backend.
* Tests: 111 passed. E2E on the live server passed. Screenshots in `docs/screenshots/`.
* Docs: README, TECHNICAL_REPORT, ARCHITECTURE, DATASETS, MODEL_CARD, PRIVACY, TESTING, DEMO_GUIDE, DEMO_SCRIPT.

## Outstanding / optional
1. User: run the physical offline test (docs/PRIVACY.md P8) and optionally provide `PS 01(1).pdf` (K1).
2. Optional Priority-3: transformer + ONNX comparison (needs approval for a ~0.5–1 GB download).
3. Optional: collect real genuine Indian service SMS for a truer FPR estimate.

## Blockers
None for the delivered scope.

## Resume commands
```powershell
.\.venv\Scripts\python.exe -m pytest -q        # verify state (expects 111 passed)
.\run.ps1                                       # http://127.0.0.1:8000
.\scripts\train_all.ps1                         # full rebuild if preprocessing/engines change
```

## Checkpoint log

### CHECKPOINT 0 — Environment audit
**Status:** PASS · workspace empty; tools detected (see CHECKPOINTS.md); `.venv` + pinned deps installed.
**Issue:** problem-statement PDF not found (K1).

### CHECKPOINT 1 — Architecture
**Status:** PASS · modular tree as briefed; one shared inference path; git initialised.

### CHECKPOINT 2 — Datasets
**Status:** PASS · `scripts/download_data.py`, `ml/datasets/prepare.py`, `augment.py`.
**Verification:** checksums OK; report generated; leakage audit 0 %/0.3 %. Augmentation re-balanced after an
initial run produced a Hinglish scam skew (970 vs 647).
**Issues:** synthetic share 41 %; small Hinglish set (K2, K3).

### CHECKPOINT 3 — Preprocessing
**Status:** PASS · `backend/preprocessing/*`. Bugs found and fixed: heredoc corrupted `\b` into backspace
characters (rewrote the file); URLs swallowed trailing punctuation (regex end-class; caught by a unit test).

### CHECKPOINT 4 — Semantic engine
**Status:** PASS · selection table in `reports/training_report.json`; LR C=16 (val AUC 0.9866).

### CHECKPOINTS 5–7 — Tactics, trust signals, benign protection
**Status:** PASS · refinements after review: "login to" counts as link-pushing only when a link exists;
`url_count` removed (collinear with `has_url`, gave a confusing explanation sign); global brands added to the
domain list after validation false-positive analysis.

### CHECKPOINT 8 — Fusion & calibration
**Status:** PASS · first run picked threshold 0.8 under an FPR ≤ 2 % rule; replaced by a fixed 0.5 for
confidence consistency (D11), with the sweep kept.

### CHECKPOINT 9 — Categories
**Status:** PASS · C=4, OTHER threshold 0.5; test macro-F1 0.849.

### CHECKPOINT 10 — Explainability
**Status:** PASS · fixed a scalar-conversion bug found during live API testing; confidence text and UI no longer
round 0.9999 up to "100 %" (shown as "over 99 %" / ">99.5 %").

### CHECKPOINTS 11–13 — Frontend, API, Mutation Lab
**Status:** PASS · FastAPI `/docs` disabled because it loads a CDN script.

### CHECKPOINT 14 — Privacy
**Status:** PARTIAL · all automated and OS-level checks pass; physical offline run pending (user action).

### CHECKPOINTS 15–19 — Evaluation, tests, performance, docs, final E2E
**Status:** PASS · numbers above; `docs/TESTING.md`.
