# Model training guide

All steps run on CPU and are reproducible from pinned public data (`scripts/download_data.py` checks SHA-256).
`.\scripts\train_all.ps1` runs them in order:

| Step | Command | Output |
|---|---|---|
| Download | `python scripts\download_data.py` | `ml/datasets/raw/*` (pinned revisions) |
| Prepare | `python ml\datasets\prepare.py` | `processed/dataset.parquet` — 25,421 rows, near-duplicate-group split train/val/test, leakage audit, `reports/dataset_report.md` |
| Augment | `python ml\datasets\augment.py` | 3,760 train-only augmented rows; 11,000-row adversarial test set |
| Train | `python ml\training\train.py` | `ml/artifacts/tekme_bundle.joblib` (semantic LR, specialist, fusion + 5 ablations, isotonic calibration, category model) |
| Evaluate | `python ml\evaluation\evaluate.py` | `reports/metrics.json`, `evaluation_report.md`, `error_analysis.md`, figures |
| Intelligence | `python -m ml.analysis.build_intel` | `frontend/public/model/intel.json` (k-means families on train, unfamiliarity thresholds from val, measured on test/Test B/adversarial), `reports/intel_report.json` |
| iOS compact model | `python -m ml.export.ios_model` | `ios/Shared/tekme_compact.json`, fixtures, `reports/ios_compact_report.json` |
| Parity reference | `python -m ml.export.parity` | `ml/artifacts/parity/corpus.jsonl` (git-ignored) |
| Browser export | `python -m ml.export.export_web` | `frontend/public/model/model.bin`, `model.json`, `src/engine/generated/rules.json`, `public/data/*.json` |
| Parity test | `cd frontend; npx vitest run tests/parity.test.ts` | `reports/parity_report.json` |

## Data discipline
* Test split and Test B are never used for training, tuning or calibration; augmentation is train-only.
* Thresholds: fusion 0.5 (fixed, D11); category OTHER fallback chosen on val; unfamiliarity thresholds = val 5th
  percentile; iOS junk threshold = lowest with val FPR ≤ 1%.
* Changing preprocessing or rules ⇒ re-run the whole pipeline so Python, browser and reports agree.

## Feedback from users
Feedback collected in the app is exported (redacted) and passed to `python -m ml.feedback.ingest file.json`,
which only creates `ml/datasets/feedback/feedback_review.csv` with `status=needs_review`. Using approved rows for
training is a deliberate manual change followed by the full pipeline above; feedback never enters test or Test B.
