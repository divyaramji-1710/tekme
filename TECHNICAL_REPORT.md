# SCAMPRINT — Technical Report

**An Explainable, Privacy-First, Adversarially Robust On-Device Scam Message Detector**
Divya Ramji (USN 1MS24CI044) · Tinyverse Problem Statement 01 · November 2026

## 1. Abstract
SCAMPRINT classifies a single SMS/WhatsApp message as SCAM or SAFE, assigns one of five scam categories, and
reports a calibrated confidence with human-readable evidence, entirely offline on a laptop CPU. It combines a
character/word TF-IDF semantic model with three rule engines (manipulation tactics, structural trust signals and
genuine-message protection) through a calibrated, stacked logistic-regression fusion layer. On an untouched,
leakage-audited test set of 3,138 messages it reaches 95.0 % accuracy, a 3.9 % false-positive rate, ROC-AUC
0.988 and expected calibration error 0.007, with 16 ms median latency and a 7.9 MB model. Accuracy on 11,000
adversarially mutated messages is 94.7 %. On an external synthetic test set (Test B) accuracy falls to 88.5 %,
which shows the main limits of the available data.

## 2. Problem definition
Input: one message (English, Hinglish, Romanised Indian languages, Devanagari). Output: verdict ∈ {SCAM, SAFE};
category ∈ {KYC/Bank, Lottery/Prize, Loan/Credit, Job/Investment, Other} for scams; confidence = calibrated
probability of the verdict. Constraints: offline inference, ordinary laptop, robustness to links, phone numbers,
urgency, impersonation and obfuscation, and few false positives on OTPs, bank alerts, deliveries and personal
messages. (The original PDF was not available in the workspace; the specification restated in the project brief
was used — see DECISIONS D1.)

## 3. Motivation
Indian scam SMS increasingly copy the *format* of genuine bank, courier and KYC messages. Keyword filters
therefore either miss them or flag the genuine alerts they imitate. Users also cannot act on an opaque
score, and sending private messages to a cloud classifier is itself a privacy risk.

## 4. Proposed solution
Detect the manipulation strategy (what the message asks you to do, under what pressure) in addition to its
wording. Explicitly model what genuine messages look like, calibrate the output, explain every decision with
evidence, and enforce local-only operation.

## 5. System architecture
See `docs/ARCHITECTURE.md`. One inference code path (`backend/services/inference.py`) is shared by training,
evaluation and the FastAPI service. Components: preprocessing → tactics / trust signals / benign protection →
semantic + specialist models → calibrated fusion → category model → explainer. The React UI is served by the same
loopback-bound process.

## 6. Dataset preparation
Sources (all CC BY 4.0, pinned by revision and SHA-256): Scam Shield SMS (10,167 real IMC-2025 smishing reports,
4,983 Mishra & Soni messages, 8,922 synthetic service/hard-case messages), the Indian Scam SMS synthetic-audited set
(1,580 Hinglish/Hindi/regional/English), and UCI SMS Spam (ham only). Of 30,477 loaded rows, 25,421 remain after
cleaning: 4,329 exact duplicates were removed, 0 conflicting labels found, near-duplicate clustering (char
3–5-gram cosine ≥ 0.8) produced 24,597 template groups, and 671 rows were dropped by the leakage guard. The split
is group-aware: Scam Shield's real val/test messages are kept, everything else is split 70/15/15 by group.
Final: train 19,190 / val 3,093 / test 3,138, about 50 % scams, 41 % synthetic. Leakage audit: 0 % of test
messages have a training neighbour with similarity ≥ 0.9 and 0.3 % have one ≥ 0.8. Scam categories come from
source subtypes where they exist (9,550 scams). The other 3,077 scams are labelled by documented keyword rules
and excluded from category evaluation. Augmentation (3,760 rows: Hinglish phrase substitution, digit swaps,
spacing, mixed case, abbreviations) is applied to training data only and balanced per class. An adversarial set
of 11,000 rows mutates 1,000 test messages with 11 transformations, 6 of them never seen in augmentation.
Details: `docs/DATASETS.md`, `reports/dataset_report.md`.

## 7. Preprocessing
`backend/preprocessing/`:
1. **Character-level cleaning.** Remove invisible characters (zero-width joiners are kept inside Devanagari),
   map Cyrillic/Greek look-alikes to Latin when the text is Latin-dominant, and apply NFKC per character.
2. **Protect entities.** URLs (with typo filtering such as "Done.In"), UPI IDs, e-mails and phone numbers are
   left untouched by the next steps.
3. **Token transforms.** Join spaced or punctuated letters, collapse repeated characters, de-leet tokens only
   when the result is a known word (so OTPs and IDs survive), expand SMS abbreviations and canonicalise
   Romanised-Hindi spellings.
4. **Offset map.** Every normalised character points back to its source span, so evidence is highlighted on
   the original message.
5. **Model text.** Entities are masked (`xurlx`, `xphonex`, `xnumx`, `xupix`, `xemailx`), which also removes a
   dataset-identity shortcut because Scam Shield is pre-masked. English glosses are appended for Hinglish and
   Devanagari key terms (e.g. "khata band ho jayega" → "account blocked will").

## 8. Model training
* **Semantic engine.** Model selection on validation: logistic regression C ∈ {1, 4, 16} (AUC 0.9816 /
  0.9854 / 0.9866), linear SVM C ∈ {0.1, 0.5} (0.9839 / 0.9872) and Complement NB (0.9641 / 0.9586). LR C = 16
  was chosen. It is within 0.003 AUC of the best SVM and its logits decompose exactly for explanations.
* **Transactional specialist.** The same architecture, trained only on the 14,847 training messages containing
  links, phones, money, OTP/PIN words, brands or genuine-message templates.
* **Stacking.** Five-fold GroupKFold out-of-fold scores (vectorisers refit per fold) feed the fusion model, so
  it never sees in-sample base predictions.

## 9. Hybrid decision architecture
Fusion: StandardScaler + logistic regression (C = 10 chosen on validation AUC) over 47 features:

| Group | Features |
|---|---|
| Semantic | semantic logit |
| Tactics | 10 tactic strengths, counts |
| Trust | link structure, look-alike / brand mismatch, official domain, phone / call request, messaging app, UPI, money, large amount, OTP/PIN mentions, suspension words, capitals, exclamations, obfuscation, length |
| Benign | 5 template flags, safety advice, template count, conflict, OTP-share request, specialist logit + applicability |

Calibration: sigmoid versus isotonic, chosen by 2-fold cross-validated Brier score *within* the validation set
(isotonic 0.0394 vs sigmoid 0.0400), then fitted on the whole validation set. Threshold: 0.5 on the calibrated
probability, so the verdict is always the more probable class and confidence ≥ 0.5 (D11). The validation sweep
shows the trade-off: threshold 0.8 would cut validation FPR from 3.3 % to 1.8 % but lose 4.5 points of recall,
and would label as SAFE some messages whose calibrated scam probability exceeds 50 %. Category: multinomial
LR on text plus tactic tokens. If the top specific category has probability < 0.5 (tuned on validation gold
labels), the answer is OTHER. SAFE messages never receive a category.

## 10. Explainability
* **Key factors.** The fusion model's exact per-feature contributions `coef·(x−μ)/σ` (log-odds relative to an
  average training message).
* **Semantic terms.** An exact decomposition of the semantic logit into word contributions; character n-grams
  are credited to the words that contain them.
* **Supporting evidence.** Tactic, signal and genuine-pattern spans highlighted on the original text, explicitly
  labelled as supporting evidence rather than the model's full reasoning.
* **Sentences.** Composed from templates (no LLM), with an explicit uncertainty sentence for borderline scores
  (0.35–0.65) and a confidence interpretation ("messages scored like this were SCAM over 99 % of the time").

## 11. Adversarial robustness

| Mutation | Held out | Accuracy | Flip rate |
|---|---|---|---|
| unmutated baseline | | recall 0.932 / specificity 0.962 | |
| char substitution | | 0.948 | 0.001 |
| spacing | | 0.946 | 0.003 |
| abbreviation | | 0.946 | 0.011 |
| Hinglish | | 0.945 | 0.006 |
| mixed case | | 0.949 | 0.022 |
| punctuation split | * | 0.947 | 0.004 |
| unicode confusables | * | 0.948 | 0.001 |
| invisible chars | * | 0.947 | 0.000 |
| repeated chars | * | 0.948 | 0.007 |
| URL variation | * | 0.949 | 0.002 |
| combined | * | 0.941 | 0.030 |

Accuracy under mutation stays within 0.8 points of the unmutated baseline for every type, including the held-out
ones. Most of this robustness comes from normalisation, not memorisation. The Mutation Lab exposes the same
machinery interactively and reports *consistency* for arbitrary messages and *accuracy* only when the user
supplies ground truth.

## 12. Privacy
Inference uses only local files. The backend imports no HTTP client, binds to 127.0.0.1, logs no message text,
stores nothing, and installs a socket guard that refuses non-loopback connections. Verified by tests (guard,
zero outbound attempts during prediction, loading with DNS disabled, a canary message absent from logs, an AST
scan for network libraries, a UI build scan for remote assets) and by live observation (guard counter 0; the
backend's OS-level TCP table showed only 127.0.0.1 endpoints during predictions). The physically-offline Wi-Fi
test is a documented manual step. These are software-level tests, not a cryptographic proof (`docs/PRIVACY.md`).

## 13. Evaluation methodology
`ml/evaluation/evaluate.py` loads the shipped bundle through the API's own inference class and scores: the
untouched test split; per source, language and special subset (genuine OTP, bank, delivery, links, personal
chat, scam categories, Test B "hard" as the borderline set); category metrics on gold-labelled scams; the
external Test B; the adversarial set; the ablation variants A–E (each with its own fusion and calibration);
and latency/memory. All numbers in this report come from `reports/metrics.json`.

## 14. Results

| Set | n | Acc | Prec | Recall | F1 | FPR | AUC | Brier | ECE |
|---|---|---|---|---|---|---|---|---|---|
| Test | 3,138 | 0.950 | 0.954 | 0.937 | 0.946 | 0.039 | 0.988 | 0.038 | 0.007 |
| Test B (external) | 400 | 0.885 | 0.901 | 0.864 | 0.882 | 0.095 | 0.956 | 0.079 | 0.036 |
| Adversarial | 11,000 | 0.947 | 0.959 | 0.934 | 0.946 | 0.040 | 0.987 | 0.040 | 0.009 |

* **Test confusion matrix:** TN 1,619, FP 65, FN 92, TP 1,362.
* **By source** (accuracy):

  | Source | Accuracy | Note |
  |---|---|---|
  | IMC real scams | 0.954 | |
  | Mishra & Soni | 0.984 | |
  | Scam Shield synthetic safe | 0.980 | FPR 2.0 % |
  | Indian synthetic | 0.920 | |
  | Scam Shield hard cases v2 | 0.886 | FPR 12.1 %, the hardest source |
* **By language** (accuracy):

  | Language | n | Accuracy |
  |---|---|---|
  | English | 2,945 | 0.951 |
  | Hinglish | 82 | 0.939 |
  | Hindi | 28 | 0.893 |
  | Regional code-mix | 83 | 0.940 |
* **Genuine subsets** (share flagged): OTP 0 %, bank 5.5 %, delivery 2.8 %, with links 5.5 %, personal chat 1.2 %.
* **Scam subsets** (recall): KYC/Bank 96.8 %, Loan 87.5 %, Lottery 92.5 %, Job/Investment 78.4 %, Other 93.5 %.
* **Categories** (macro-F1 0.849, accuracy 0.891): KYC/Bank F1 0.907, Lottery 0.768, Loan 0.920, Job/Investment
  0.758, Other 0.894. The main confusion is between specific categories and OTHER.
* **Ablation** (test F1 / FPR; Test B F1):

  | Variant | Test F1 | Test FPR | Test B F1 |
  |---|---|---|---|
  | A: semantic only | 0.946 | 4.6 % | 0.900 |
  | B: + tactics | 0.945 | 4.8 % | 0.907 |
  | C: + trust | 0.947 | 4.6 % | 0.895 |
  | D: + benign | 0.946 | 4.4 % | 0.894 |
  | E: full | 0.946 | **3.9 %** | 0.882 |

  The full hybrid gives the lowest test FPR at equal F1. No component raises test F1, and on Test B the full
  model is slightly worse than semantic + tactics. The engines are kept because FPR is a stated priority and
  because they supply the evidence for explanations. This trade-off is reported rather than hidden.
* **Efficiency:** load 2.5 s; +124 MB RSS; p50 15.9 ms, p95 29.9 ms per message with full explanation; 3.3 ms
  per message batched; bundle 7.9 MB; frontend 88 KB gzipped JS.

## 15. Limitations
Synthetic genuine-service and Hinglish data (FPR on real Indian service SMS is unmeasured). Small language
subsets. Weak category labels for part of the training data. Lexical-only link analysis with a small domain
list. Test B shows a performance drop on unfamiliar, hard, mostly non-Indian messages (FPR 21 % on its hard
subset). Known error patterns: genuine messages that discuss scams or payments, and short context-free scams.
No transformer comparison. See `KNOWN_ISSUES.md`.

## 16. Future improvements
* Collect a consented, real Indian genuine-SMS test set.
* Evaluate a small multilingual transformer exported to ONNX (e.g. MiniLM) as an additional semantic feature.
* Add sender-ID features (DLT headers such as `VM-HDFCBK`) when available.
* Active learning from Mutation Lab failures.
* Package as a desktop app (Tauri) or Android on-device (ONNX/TFLite).
* Periodic retraining with drift monitoring.

## 17. References
1. T. A. Almeida, J. M. Gómez Hidalgo. *SMS Spam Collection v.1*, UCI ML Repository, 2011.
2. S. Agarwal, A. Papasavva, G. Suarez-Tangil, M. Vasek. *Fishing for Smishing: Understanding SMS Phishing
   Infrastructure and Strategies by Mining Public User Reports.* ACM IMC 2025. doi:10.1145/3730567.3764431.
3. S. Mishra, D. Soni. *SMS Phishing Dataset for Machine Learning and Pattern Recognition.* Mendeley Data, 2022.
   doi:10.17632/f45bkkt8pr.1.
4. rasheq. *Scam Shield SMS* (v1.1.0), Hugging Face, 2026.
5. Ridham115. *Indian Scam SMS (synthetic, audited)*, Hugging Face, 2026.
6. F. Pedregosa et al. *Scikit-learn: Machine Learning in Python.* JMLR 12, 2011.
7. B. Zadrozny, C. Elkan. *Transforming classifier scores into accurate multiclass probability estimates.* KDD 2002.
8. C. Guo, G. Pleiss, Y. Sun, K. Weinberger. *On Calibration of Modern Neural Networks.* ICML 2017.
9. D. H. Wolpert. *Stacked Generalization.* Neural Networks 5(2), 1992.
10. Unicode Consortium. *UTS #39: Unicode Security Mechanisms (confusables).*
