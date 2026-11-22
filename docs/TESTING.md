# Testing report

Run everything with `.\test.ps1` (pytest + frontend offline-asset scan). Last run: 2026-11-23, Windows 11,
Python 3.12.10, CPU only. **Result: 111 passed, 0 failed, 0 skipped**; `npm run check:offline` OK.

| Suite | Tests | Result | What it covers |
|---|---|---|---|
| `tests/unit` | 49 | pass | normalisation of the problem-statement examples, offset mapping, OTP/ID preservation, URL/phone/UPI extraction, sentence-typo rejection, homoglyph/invisible/spacing/repeat handling, Devanagari glossing, language ID; tactic detection incl. negation and context rules; benign templates and OTP-share conflicts; URL lexical features, registered domains, brand mismatch; confidence interpretation; weak category rules; every mutation type, determinism, URL safety, normaliser recovery |
| `tests/integration` | 16 | pass | app startup + model loading (lifespan), `/health`, `/api` alias, `/model/info`, `/predict` schema and confidence consistency (confidence = calibrated P(verdict) ≥ 0.5, SAFE ⇒ category null, highlight spans match original text), KYC category, invalid input (empty, blank, > 2,000 chars, missing, wrong type) → 422 without echoing text, `/mutate`, `/evaluate-mutations` with/without ground truth, unknown mutation type, `/metrics`, `/privacy/status`, `/examples`, restricted CORS, security headers |
| `tests/privacy` | 7 | pass | socket guard blocks external / allows loopback; zero outbound attempts during predictions; model loads with DNS disabled; canary message never appears in logs; loopback-only config; no network-client imports in `backend/` (AST scan); no remote assets in the UI build |
| `tests/adversarial` | 35 | pass | 8 obfuscation types × 3 scam probes stay SCAM; Hinglish-transformed scams; native Hinglish, Devanagari and Hinglish-lottery probes; genuine messages survive case/repeat noise; OTP contrast pair (SAFE vs SCAM) |
| `tests/performance` | 4 | pass | single-message latency (measured median 20.1 ms, p95 32.3 ms under pytest; budget 500 ms), 120-message batch + determinism, RSS (297 MB; budget 2 GB), no GPU frameworks imported |

Budgets are deliberately generous so the suite is stable on slower laptops; the measured numbers are reported.
The adversarial *tests* are behavioural probes written by the developer; the adversarial *benchmark*
(11,000 labelled mutations of test messages) is in `reports/evaluation_report.md`.

## End-to-end verification (live server, 2026-11-23)

Performed against `python -m backend.main` on 127.0.0.1:8000 serving the production UI build:

* UI index and all bundled assets load from the local backend (HTTP 200).
* All 14 example messages returned the expected verdict; categories KYC_BANK ×5, LOTTERY_PRIZE, JOB_INVESTMENT,
  LOAN_CREDIT, OTHER; SAFE results had `category = null`; confidence ∈ [0.5, 1].
  (These examples were written by the developer for the demo, so this is a smoke test, not an evaluation.)
* `/api/metrics` is byte-identical to `reports/metrics.json` (the dashboard shows the saved results).
* Privacy status: guard active, 0 blocked attempts, 0 external sockets; FastAPI `/docs` disabled.
* OS view (`Get-NetTCPConnection` for the backend PID during 5 predictions): only 127.0.0.1 endpoints.
* Server log: no message text, no errors.
* Headless-Edge screenshots of every page captured (`docs/screenshots/`), showing real predictions.
* No hard-coded predictions in the frontend source (grep for verdict literals outside rendering logic).

## Not automated
* Physically disabling Wi-Fi (requires the user; procedure in `docs/PRIVACY.md`, step P8).

## Browser console
Headless Edge with `--enable-logging=stderr` on all five pages (Analyzer with a deep-linked prediction, Mutation
Lab auto-run, Diagnostics, Privacy, About): **0 console messages from the app**, no uncaught errors, no failed
loads. The single logged line came from a built-in Edge extension (`chrome-extension://…`), not SCAMPRINT.
