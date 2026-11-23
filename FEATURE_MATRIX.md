# Feature matrix — TEKMĒ

**Done** = implemented and verified by the tests or live checks named · **Partial** = works with a stated gap ·
**Not verified** = implemented but could not be run here · **Needs user** = blocked on a user action.
_Last updated 2026-11-23 (checkpoint T20)._

## Core
| Requirement | Status | Evidence |
|---|---|---|
| One message → SCAM/SAFE, category, calibrated confidence, explanation | Done | Python + browser engines; parity 5,072/5,072 verdicts; behaviour tests |
| Five categories | Done | category macro-F1 0.849 (reports/metrics.json) |
| English, Hinglish, transliterated Hindi, Devanagari, obfuscation | Done (data small for Hinglish/Hindi) | adversarial tests; 11k-mutation benchmark 94.7% |
| Low false positives on OTP / bank / delivery / chat | Done (synthetic genuine data, K2) | 0/58 genuine OTPs flagged; behaviour tests |
| Offline, on-device inference | Done | browser engine; UI test records zero off-origin requests; build scan |
| Physical Wi-Fi-off demonstration | Needs user | docs/OFFLINE_VERIFICATION.md step C |
| UNCERTAIN verdict | Done | borderline band + unfamiliar & conf < 0.75 (D24) |

## Advanced features
| # | Feature | Status | Where / verified by |
|---|---|---|---|
| 1 | Scam conversation simulator | Done (rule-based aggregation, K20) | `analysis/conversation.ts`, Conversation page; analysis tests |
| 2 | Counterfactual explanations | Done | `analysis/counterfactual.ts` re-runs the model; Lab page; test checks re-scoring |
| 3 | Scam family clustering | Done | `ml/analysis/build_intel.py` (k-means, train split), 11 families; Model Intelligence + Library |
| 4 | Out-of-distribution detection | Done (weak error predictor, K17) | thresholds from val; measured on test/Test B/adversarial; TS⇄Python parity test |
| 5 | Offline URL forensics | Done | `analysis/forensics.ts`; tests for punycode, credentials, IP, look-alike, downloads |
| 6 | UPI / payment fraud | Done | PIN-to-receive, collect, QR, advance fee, personal UPI, refund lure vs genuine alert; tests |
| 7 | Brand impersonation | Done | brand claims vs local domain list; never "verified"; tests |
| 8 | Personalised safety guidance | Done | `analysis/guidance.ts` (tiers × category × evidence) |
| 9 | Scam evolution timeline | Partial (by design) | cross-source comparison ordered by publication year; no per-message dates exist, so no timeline is claimed |
| 10 | Model battle arena | Done | 5 calibrated fusion variants run live in the browser + measured test/Test B metrics |
| 11 | Interactive evidence heatmap | Done | focusable highlights with meanings; axe-checked |
| 12 | Robustness stress-test dashboard | Done | live Mutation Lab + measured per-mutation accuracy/flip rate |
| 13 | Local feedback learning | Done (manual retraining, K21) | local store, redacted export, `ml/feedback/ingest.py` review file |
| 14 | Privacy audit mode | Done | network audit (Performance API), offline prediction test, storage audit, delete |
| 15 | Multilingual explanations | Done (English + Hinglish templates) | `analysis/explainHinglish.ts`, guidance in Hinglish |
| 16 | Accessibility mode | Done | text scaling, reduced motion, high contrast, keyboard, skip link; axe on all pages; WCAG AA contrast test (52 checks) |
| 17 | Batch scanner | Done | CSV/text import, progress, filter/sort, labelled metrics, redacted CSV/JSON export; tests |
| 18 | Local threat pattern library | Done | generated from engine rules + families; versioned by rules hash; search/filter |
| 19 | Privacy-safe export | Done | redaction options; redacted JSON contains no identifiers (test) |
| 20 | Uncertainty-aware advice | Done | UNCERTAIN tier with its own guidance |

## Platform and UI
| Item | Status | Evidence |
|---|---|---|
| TEKMĒ branding, Evidence Mark (SVG, favicon, PWA icons, loader) | Done | docs/screenshots; `brand/EvidenceMark.tsx`, `public/icons` |
| Dark + light + system themes, persisted, no flash | Done | UI tests (cycle, persistence, theme-init before React) |
| Matches approved mockups | Done (compared side by side; honest copy where mockups over-claimed) | screenshots 01/02 vs docs/design/mockup_*.png |
| Athena hero (user-supplied, optimised WebP, responsive) | Done | 44–193 kB WebP; mobile crop |
| Responsive desktop / tablet / phone | Done | 390 px captures 14/15 |
| PWA (manifest, service worker, offline shell + model) | Done on desktop browsers; Needs user for iPhone (HTTPS hosting, K19) | sw.js generated at build |
| Native iOS source | Done (source) / Not verified (build, install, filtering) | `ios/`; Python test of exported model math |
