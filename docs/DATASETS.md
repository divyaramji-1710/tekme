# Datasets

All data is public. Raw files are **not** committed; `scripts/download_data.py` fetches each file at a pinned
upstream revision and verifies its SHA-256. Generated statistics: `reports/dataset_report.md`.

## Sources

| Source | Used rows | Labels | Licence | Real / synthetic | Role |
|---|---|---|---|---|---|
| [Scam Shield SMS](https://huggingface.co/datasets/rasheq/scam-shield-sms) @ `08549fd` — IMC 2025 smishing reports (Agarwal et al., IMC '25) | 10,167 loaded | scam (banking, delivery, government, telecom, wrong number, hey mum/dad, others) | CC BY 4.0 | real (user-reported) | scams; published val/test kept |
| Scam Shield — Mishra & Soni SMS phishing (Mendeley, 2022) | 4,983 loaded | ham → SAFE, smishing → SCAM | CC BY 4.0 | real | personal chat + smishing |
| Scam Shield — synthetic safe service messages | 4,953 | SAFE (OTP, bank alerts, deliveries, bills, travel) | CC BY 4.0 | **synthetic** (LLM) | hard negatives |
| Scam Shield — synthetic hard cases v2 | 3,969 | ~180 types, both labels | CC BY 4.0 | **synthetic** (LLM) | hard cases, fine-grained scam types |
| [Indian Scam SMS synthetic-audited](https://huggingface.co/datasets/Ridham115/indian-scam-sms-synthetic-audited) @ `45e92c3` | 1,580 | scam/safe, scam_type, language | CC BY 4.0 (+ generator ToS, see card) | **synthetic** (LLM, audited) | Hinglish, Hindi, regional code-mix, Indian hard negatives |
| [UCI SMS Spam Collection](https://huggingface.co/datasets/codesignal/sms-spam-collection) @ `93ffab6` | 4,825 ham loaded (most later removed as duplicates of Mishra & Soni) | ham only | CC BY 4.0 | real | personal chat |
| Scam Shield **Test B** (GitHub `Mohamedrasheq/scam-shield` @ `530abc0`, `data/test_b`) | 400 | scam/safe, category, difficulty | repository licence "Other" — used **only for local evaluation, not redistributed** | **synthetic** | external, unseen test |

Not used: a gated OTP-intent dataset (requires login), Kaggle datasets (require an account), and a 120-row
Indian set whose labels conflicted with its text.

**UCI "spam" was excluded.** It mixes advertising with scams; the task is scam detection, and Scam Shield
applied the same rule.

## Unified schema (`ml/datasets/processed/dataset.parquet`)

`message_id, text, binary_label (SAFE|SCAM), scam_category (KYC_BANK|LOTTERY_PRIZE|LOAN_CREDIT|JOB_INVESTMENT|OTHER|null),
category_source (source_label|weak_rule|null), language (en|hinglish|hi|regional_mixed), source, source_subtype,
is_synthetic, template_group, split`

## Category labelling

* **Source labels** where the source gives a subtype: Indian `fake_kyc/fake_bank_otp→KYC_BANK, lottery→LOTTERY_PRIZE,
  loan_offer→LOAN_CREDIT, job_offer→JOB_INVESTMENT, courier_customs/electricity_bill→OTHER`; ~100 Scam Shield v2
  types mapped explicitly (see `ml/datasets/prepare.py::V2_MAP`); IMC `banking→KYC_BANK`,
  `delivery/government/telecom/wrong number/hey mum/dad→OTHER`.
* **Weak rules** (ordered keyword rules, `WEAK_RULES`) only for IMC "others" and Mishra & Soni smishing, which have
  no subtype. They are marked `weak_rule` and **excluded from category evaluation**.

## Cleaning, PII and leakage prevention

1. Whitespace normalised; messages with < 2 words dropped.
2. Phone numbers / e-mails masked in genuine *personal* messages (UCI, Mishra & Soni ham), matching Scam
   Shield's own masking. Scam Shield text is already masked (`<URL>`, `<PHONE_NUMBER>`, …).
3. Exact duplicates on a normalised key (lower-case, digits/URLs collapsed); keys with conflicting labels are
   dropped (0 found). Rows with a published split and real rows are preferred when de-duplicating.
4. Near-duplicate clustering: char 3–5-gram TF-IDF, cosine ≥ 0.8, union-find → `template_group`.
5. Split: Scam Shield real messages keep their published train/val/test; all other groups split 70/15/15,
   stratified by source. Train rows whose group touches val/test are dropped; val rows touching test too.
6. Audit: nearest-neighbour similarity of every test message to the training set (see dataset report;
   0 % ≥ 0.9, 0.3 % ≥ 0.8). Test B near-duplicates (≥ 0.8) of train are removed.
7. Augmentation happens **after** the split, on train only, class-balanced per mutation type; variants
   inherit the parent's group.

## Known limitations

* 41 % of rows are synthetic (LLM-written). Genuine *service* messages are almost entirely synthetic, so
  false-positive rates on real bank/OTP traffic may differ from what is reported.
* Hinglish / Hindi / regional rows are few (~1.3k) and synthetic; the Indian set's author notes shortcut risks
  (invented scam domains vs real brand domains).
* IMC reports contain some genuine messages users were unsure about (label noise acknowledged by Scam Shield).
* Mishra & Soni personal chats are from ~2010–2012, mostly UK/Singapore.
* Loan/Credit (122 training scams) and Job/Investment are under-represented.
