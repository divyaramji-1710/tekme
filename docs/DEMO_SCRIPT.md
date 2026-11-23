# Demo script (≈ 7 minutes)

Setup: `.\run.ps1`, open http://127.0.0.1:8000 in Edge/Chrome. Optional: turn Wi-Fi off before starting.
All outputs below are computed live; describe what you see, not numbers from this script.

1. **Home (30 s)** — "TEKMĒ — evidence over instinct." The demo KYC message is already analysed *in this browser*:
   Suspected Scam, Bank / KYC, calibrated confidence, Evidence Dossier (impersonation, look-alike link, urgency,
   threat). Toggle the theme (top right) to show the light design.
2. **Analyzer (90 s)** — click *View Full Analysis*. Show the confidence meter (threshold and borderline band),
   explanation, switch to **Hinglish**, click highlights in the **evidence heatmap**, Scam DNA strengths, the
   model's own key factors, and *What to do*. Export → Markdown with redaction on.
3. **False-positive protection (40 s)** — pick *Genuine OTP* (SAFE, safety advice recognised) then
   *OTP-sharing trap* (same shape, asks to share the code → SCAM).
4. **Forensics (60 s)** — Investigate: link forensics (look-alike, sub-domain, http), payment patterns, brand
   claim wording ("never verified"), sender ID `AX-SBIBNK` vs `+44…`, evidence timeline, nearest scam family.
5. **Conversation (45 s)** — run *Fake bank officer*: per-turn verdicts and the escalation path rapport →
   pressure → credential harvesting; read the note that it aggregates a single-message model.
6. **Adversarial Lab (60 s)** — run the stress test; point at flipped variants (if any) and the counterfactual
   table ("removing the link changes P(scam) from … to …"); show the measured robustness dashboard.
7. **Model Intelligence (60 s)** — test metrics, Test B (harder, external), calibration, **Model Battle Arena**
   (type a message; five models answer live), unfamiliarity results (honest: detects shift, barely predicts
   errors), parity line (browser = Python on 5,072 messages).
8. **Privacy (30 s)** — network audit (all same-origin), *Run offline prediction test* → 0 requests (with Wi-Fi
   off this is conclusive), storage audit and delete buttons.
9. **iPhone (20 s)** — status table: web app available; native filter source in development, not verified.

Q&A pointers: data limitations (synthetic genuine messages), why the hybrid doesn't beat B on Test B F1,
why the iOS model is separate and weaker (FPR-first), what Apple's filter API can and cannot do.
