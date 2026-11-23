# Feature matrix — TEKMĒ (formerly SCAMPRINT)

Status key: **Done** = implemented and verified by tests or a live run · **Partial** = some of it exists ·
**Missing** = not started · **Blocked** = needs something from the user or a Mac.
Every row is updated only after its verification has actually been run.

_Baseline audit: 2026-11-23 (Checkpoint 1)._

## Core requirements

| Requirement | Status | Where today | Gap |
|---|---|---|---|
| One message → SCAM/SAFE, category, calibrated confidence, explanation | Done | `backend/services/inference.py`, `/predict` | — |
| Five categories (KYC_BANK, LOTTERY_PRIZE, LOAN_CREDIT, JOB_INVESTMENT, OTHER) | Done | `backend/engines/categorizer.py` | — |
| English, Hinglish, transliterated Hindi, obfuscation | Done | `backend/preprocessing/*` | Hinglish data small/synthetic (K3) |
| URLs, phones, UPI, brand impersonation, tactics | Done (lexical) | `trust_signals.py`, `tactics.py`, `patterns.py` | No dedicated forensics views |
| Low false positives on OTP / bank / delivery / chat | Done | `benign_protection.py`, specialist LR | Synthetic genuine data (K2) |
| Offline inference, no message logging, localhost only | Done | `backend/core/privacy.py` | Physical Wi-Fi-off run pending (K10) |
| "Uncertain" verdict | Missing | — | Needs OOD / uncertainty layer (F4, F20) |

## Advanced features

| # | Feature | Status | Existing building blocks | Gap |
|---|---|---|---|---|
| 1 | Scam Conversation Simulator | Missing | per-message tactics | multi-turn API, escalation timeline, UI |
| 2 | Counterfactual explanations | Missing | `predict_batch`, evidence spans | edit generation + re-inference, UI |
| 3 | Scam family clustering | Missing | TF-IDF vectoriser in bundle | clustering job on train data, UI |
| 4 | Out-of-distribution detection | Missing | vectoriser, fusion features | OOD score fitted on train, calibrated on val |
| 5 | Offline URL forensics | Partial | `trust_signals.analyse_url` (lookalike, shortener, TLD, IP, brand mismatch) | punycode, credentials, subdomain depth, path terms, dedicated view |
| 6 | UPI / payment fraud | Partial | UPI regex, payment-demand tactic | collect-request / PIN / QR logic, legit-notification contrast |
| 7 | Brand impersonation analyzer | Partial | official domain list, brand mismatch | sender-claim analysis, dedicated output |
| 8 | Personalised safety guidance | Missing | category + evidence | deterministic guidance templates |
| 9 | Scam evolution timeline | Missing | dataset sources | only if a documented date field exists; otherwise cross-source comparison, labelled as such |
| 10 | Model Battle Arena | Partial | ablation variants A–E in bundle, ablation table | live side-by-side predictions UI |
| 11 | Interactive evidence heatmap | Partial | `HighlightedText.tsx`, span labels | per-span explanation popovers, keyboard access |
| 12 | Robustness stress-test dashboard | Partial | Mutation Lab, per-mutation metrics | before/after comparison view |
| 13 | Local feedback learning | Missing | — | local feedback store, review/export; no silent retraining |
| 14 | Privacy audit mode | Partial | Privacy Center, guard counters, socket table | storage audit, browser-side request audit |
| 15 | Multilingual explanations | Missing | English templates | Hinglish templates |
| 16 | Accessibility mode | Missing | basic semantic HTML | text scaling, reduced motion, focus, audits |
| 17 | Batch scanner | Missing | `predict_batch` | CSV/text import, progress, filter, export |
| 18 | Threat pattern library | Missing | tactic + template definitions | versioned pattern file, search UI |
| 19 | Privacy-safe export | Missing | entity extraction | redaction options, export formats |
| 20 | Uncertainty-aware advice | Missing | calibrated probability | uncertainty band + advice tiers |

## Platform and UI

| Item | Status | Gap |
|---|---|---|
| TEKMĒ branding, Evidence Mark, fonts | Missing | Full rebrand; fonts must be bundled locally |
| Dark + light + system theme, no flash | Missing | Current UI is dark navy only |
| Athena hero artwork | **Blocked** | Mockups are flattened 1536×1024 screenshots; a clean separate asset is needed |
| Responsive layout (desktop / tablet / phone) | Partial | Current pages are responsive but not to the new design |
| PWA (installable, offline shell) | Missing | manifest, service worker, icons |
| In-browser inference (no backend) | Missing | feasibility to be assessed (model is scikit-learn) |
| Native iOS Message Filter source | Missing | `ios/` module |
| iOS build / install / filtering | **Blocked** | Needs macOS + Xcode; cannot be verified on Windows |
