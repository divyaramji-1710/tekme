# Model card — SCAMPRINT 1.0

| | |
|---|---|
| Model | Hybrid: word+char TF-IDF logistic regression (semantic) + transactional specialist + rule engines → calibrated logistic-regression fusion; multinomial LR category model |
| Version / date | `scamprint-1.0`, trained 2026-11-23 (`reports/training_report.json`) |
| Artifact | `ml/artifacts/scamprint_bundle.joblib` (7.9 MB) + `vocab.txt`; scikit-learn 1.9.1, Python 3.12 |
| Developer | Divya Ramji (1MS24CI044), Tinyverse PS-01 |
| Licence of training data | CC BY 4.0 (see `docs/DATASETS.md`) |

## Intended use
Decision support for an individual checking **one** SMS / WhatsApp message on their own computer, fully offline.
Outputs SCAM/SAFE, a scam category, a calibrated confidence and evidence. **Not** intended for automated
blocking of messages at scale, for legal decisions, or as proof that a message is fraudulent.

## Inputs / outputs
* Input: UTF-8 text ≤ 2,000 characters (English, Hinglish, Romanised regional code-mix, Devanagari Hindi).
* Output: `verdict` (threshold 0.5 on calibrated P(scam)); `confidence` = calibrated P(predicted verdict) ≥ 0.5;
  `category` ∈ {KYC_BANK, LOTTERY_PRIZE, LOAN_CREDIT, JOB_INVESTMENT, OTHER} for SCAM, `null` for SAFE.

## Training data
19,190 training messages + 3,760 train-only augmented variants; 3,093 validation messages; 41 % synthetic.
Real scams: IMC 2025 public smishing reports; real genuine messages: personal chat (UK/Singapore, 2010–12);
genuine service messages and Hinglish/Hindi data: LLM-generated. Full provenance: `docs/DATASETS.md`.

## Evaluation (untouched test set, n = 3,138; `reports/evaluation_report.md`)

| Metric | Value |
|---|---|
| Accuracy | 0.950 |
| Precision / Recall (scam) | 0.954 / 0.937 |
| F1 / macro-F1 | 0.946 / 0.950 |
| False-positive rate / false-negative rate | 0.039 / 0.063 |
| ROC-AUC | 0.988 |
| Brier / ECE (10 bins) | 0.038 / 0.007 |
| Category macro-F1 (1,145 gold-labelled scams) | 0.849 |
| External Test B (n = 400, unseen, synthetic, mostly non-Indian) | acc 0.885, F1 0.882, FPR 0.095 |
| Test B "hard" subset (n = 118) | acc 0.771, FPR 0.211 |
| Adversarial set (11,000 mutations of test messages) | acc 0.947; every mutation type ≥ 0.941 accuracy |
| Latency (i7-1355U, CPU) | p50 15.9 ms, p95 29.9 ms per message incl. explanation; 3.3 ms/msg batched |

Genuine subsets (share wrongly flagged): OTP 0/58, bank notifications 5.5 %, delivery 2.8 %, messages with links
5.5 %, personal chat 1.2 %. Language: English acc 0.951 (n = 2,945), Hinglish 0.939 (82), Hindi 0.893 (28),
regional code-mix 0.940 (83) — small samples, synthetic.

## Ablation (test, each variant calibrated on val)
Semantic-only already reaches F1 0.946. The full hybrid keeps F1 (0.946) and lowers FPR from 4.6 % to 3.9 %
(−16 % relative), at −0.8 pt recall. On Test B the hybrid ties the best FPR (9.4 %) but has the lowest F1
(0.882 vs 0.900 semantic-only, 0.907 semantic+tactics). The engines' main value is **fewer false alarms and
evidence for explanations**, not raw accuracy.

## Known failure modes (from `reports/error_analysis.md`)
* Genuine messages that *describe* scams or ask to pay through official channels (IRS refund notice, FedEx
  duties via app, branch-visit KYC reminders) are flagged.
* Short, context-free scam reports ("18 debited from your wallet.") and scams using official-looking domains
  (`uidai.gov.in/loanoffer`) are missed.
* Hindi/regional scams with few cues.

## Ethical considerations
False negatives can cause financial loss; false positives erode trust in genuine alerts. The UI always shows
evidence, flags borderline scores (0.35–0.65) and recommends verifying via official channels. No message data
is stored or transmitted.

## Maintenance
Retrain with `scripts/train_all.ps1` when new labelled data is available; scams drift over time.
