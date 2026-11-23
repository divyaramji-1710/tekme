# Checkpoints

## Phase 2 — TEKMĒ (rebrand + advanced features)

| # | Phase | Status | Verified by |
|---|---|---|---|
| T1 | Repository audit | PASS | baseline 110/111 (latency on battery, K14); FEATURE_MATRIX created |
| T2 | Architecture | PASS | D19–D30; browser engine + analysis contract (`analysis/analyze.ts`) |
| T3 | TEKMĒ branding | PASS | Evidence Mark SVG/PNG icons/loader; OFL fonts bundled; tokens |
| T4 | Dark and light themes | PASS | UI tests (cycle, persistence, no-flash script); contrast test 52/52 |
| T5 | Website redesign + Athena hero | PASS | screenshots compared with both mockups; responsive 390 px captures |
| T6 | Core detection engine | PASS | parity 5,072/5,072 verdicts & categories; behaviour tests 15/15 |
| T7 | Scam DNA and evidence | PASS | heatmap, Scam DNA, dossier, key factors, guidance (EN/Hinglish) |
| T8 | URL, UPI, impersonation | PASS | forensics tests |
| T9 | Conversation intelligence | PASS | escalation tests |
| T10 | Adversarial features | PASS | Mutation Lab port, counterfactual re-scoring test, robustness dashboard |
| T11 | Model intelligence | PASS | arena, calibration, families, unfamiliarity (measured), source comparison, perf, parity |
| T12 | Batch and threat library | PASS | batch tests; library page renders (UI test) |
| T13 | Privacy and accessibility | PASS (automated) / physical offline run needs user | UI fetch recorder, build scan, axe all pages |
| T14 | PWA | PASS desktop / iPhone needs HTTPS hosting (user) | sw.js precache; Privacy Center shows SW state |
| T15 | Native iOS source | PASS (source written) | `ios/` |
| T16 | iOS feasibility validation | PARTIAL | exported model math verified in Python; Swift never compiled (no Mac) — documented |
| T17 | Integration testing | PASS | pytest 113 passed; vitest 106 passed; build + offline scan OK |
| T18 | Final polish | PASS | error boundary, NaN-safe reports, mockup alignment fixes |
| T19 | Documentation | PASS | README, ARCHITECTURE, SETUP_WINDOWS, MODEL_TRAINING, PARITY, PRIVACY, OFFLINE_VERIFICATION, IOS_GUIDE, TESTING, DEMO_SCRIPT, TROUBLESHOOTING |
| T20 | Final demonstration | PASS | DEMO_SCRIPT walkthrough uses live outputs; 15 real screenshots |

## Phase 1 — SCAMPRINT prototype (complete)

| # | Phase | Status | Verified by |
|---|---|---|---|
| 0 | Environment audit | PASS | Win 11, Python 3.12.10, Node 24.15.0 / npm 11.12.1, Git 2.55, i7-1355U (12 threads), 31.7 GB RAM, 286 GB free, no GPU; `.venv` created; deps installed |
| 1 | Project architecture | PASS | structure created; backend starts, UI builds |
| 2 | Dataset research & preparation | PASS | 6 pinned files SHA-verified; 25,421 rows; group split; leakage audit 0 % ≥ 0.9 (`reports/dataset_report.md`) |
| 3 | Hinglish & obfuscation preprocessing | PASS | 13 unit tests incl. all 5 brief examples |
| 4 | Semantic engine | PASS | 7 candidates on val; LR C=16 saved/reloaded; evaluated on test |
| 5 | Scam DNA / tactics | PASS | unit tests (brief messages A/B, negation, context rule); E2E examples |
| 6 | Trust & risk signals | PASS | URL/brand unit tests; zero network (guard tests) |
| 7 | Legitimate-message protection | PASS | OTP pair SAFE/SCAM; genuine OTP 0/58 flagged; ablation D lowers FPR vs A |
| 8 | Calibrated fusion | PASS | OOF stacking; isotonic; test ECE 0.007, Brier 0.038; schema tests |
| 9 | Category classifier | PASS | macro-F1 0.849 (gold); SAFE never categorised (0) |
| 10 | Explainability | PASS | exact contributions; highlights map to original text (integration test) |
| 11 | Frontend | PASS | `npm run build` strict TS; 8 headless screenshots; 0 app console messages |
| 12 | FastAPI integration | PASS | 16 integration tests; live E2E on 14 examples |
| 13 | Mutation Lab | PASS | 11 types; API + UI; consistency vs accuracy distinction |
| 14 | Offline privacy verification | PARTIAL | automated guard/DNS/log/build tests + OS TCP table PASS; physical Wi-Fi-off run not performed (needs user) |
| 15 | Comprehensive evaluation | PASS | `reports/metrics.json`, evaluation report, figures, ablation, error analysis |
| 16 | Automated testing | PASS | 111 passed, 0 failed, 0 skipped |
| 17 | Performance | PASS | p50 15.9 ms, p95 29.9 ms, 7.9 MB, +124 MB RAM, 88 KB gz UI (see K14 for power-state variance) |
| 18 | Documentation | PASS | README, TECHNICAL_REPORT, docs/* |
| 19 | Final E2E verification | PASS | see docs/TESTING.md "End-to-end verification" |
