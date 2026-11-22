# Demo script (≈ 7 minutes)

Setup before presenting: `.\run.ps1` → open http://127.0.0.1:8000 (fullscreen browser, zoom 110 %).
Every example below is in the **Load example…** menu. All results are computed live — nothing is pre-recorded.

| # | Time | Scenario | Do | Say |
|---|---|---|---|---|
| 0 | 0:00–0:40 | Hook | Analyzer tab, empty state | "Scam SMS in India copy real bank alerts word-for-word. Keyword filters either miss them or flag your real OTPs. SCAMPRINT detects the *manipulation strategy* — fully offline." |
| 1 | 0:40–1:40 | Conventional scam | Load **Fake KYC warning** → Analyse | Point to SCAM · KYC / Bank · confidence; Scam DNA (urgency, threat, impersonation); risk signals (look-alike domain, brand ≠ link). "Confidence is calibrated: messages scored like this were scams about that often on held-out data." |
| 2 | 1:40–2:40 | Genuine notification | Load **Genuine OTP** → Analyse; then **OTP-sharing trap** | SAFE with "routine OTP notification" + "does not ask you to share the code". Then the trap: same OTP shape, but "send the OTP to our agent" → conflict detector → SCAM. "We never whitelist the word OTP." |
| 3 | 2:40–3:30 | Hinglish | Load **Hinglish KYC scam**, then **Hindi (Devanagari) scam** | Language badge; highlighted "band ho jayega", "turant", "warna". Glosses let English training transfer to Hinglish. |
| 4 | 3:30–4:40 | Obfuscation | Load **Obfuscated KYC scam** → show "normalised text"; click **Stress-test** → Mutation Lab, ground truth SCAM → Generate | Leet, spaced letters, Cyrillic look-alikes, invisible characters. Show consistency and accuracy vs ground truth; mention held-out mutation types. "Consistency is not accuracy — that's why we ask for ground truth." |
| 5 | 4:40–5:40 | Privacy | Turn Wi-Fi off → Privacy Center → **Run offline prediction test** | Checklist: model local (SHA-256), guard active, 0 blocked attempts, 0 external sockets, 127.0.0.1 binding, no logging. "localhost is this laptop, not a server." |
| 6 | 5:40–6:40 | Evidence | Model Diagnostics | Test metrics, false-positive rate, reliability diagram, ablation (what each engine adds), robustness by mutation, per-language table, latency on this CPU. Be explicit about limitations (synthetic genuine-service data, small Hinglish set). |
| 7 | 6:40–7:00 | Close | About tab | "Hybrid, calibrated, explainable, private — and honest about where it's weak." |

## Backup plan
* If the browser cannot reach the backend: the header shows "Backend offline"; restart `.\run.ps1`.
* Keep `docs/screenshots/` open in a second window in case the laptop misbehaves.

## Things not to claim
* Not "99 % accurate in the real world" — quote the measured test numbers and their dataset caveats.
* Not "cryptographically private" — the offline test is an observable software test.
