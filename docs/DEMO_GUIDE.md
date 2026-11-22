# Demo guide

## Start
```powershell
.\run.ps1                    # serves UI + API on http://127.0.0.1:8000
```
Wait for `model loaded in …s` in the console, then open http://127.0.0.1:8000.

## Sections
| Tab | What to show |
|---|---|
| **Analyzer** | Paste or load an example → verdict, category, calibrated confidence, explanation, highlighted evidence, Scam DNA, risk signals, decision factors. Ctrl+Enter analyses. "Stress-test" sends the message to the Mutation Lab. |
| **Mutation Lab** | Pick mutation types (held-out ones are marked), optionally set ground truth, run. Table shows each variant's verdict/confidence and flips; tiles show consistency and accuracy. |
| **Model Diagnostics** | Saved metrics from `reports/metrics.json`: test KPIs, confusion matrix, reliability diagram, ablation, robustness, subsets, language table, categories, Test B, latency/memory. Hover bars and points for details. |
| **Privacy Center** | Offline checklist, local file hashes, live offline prediction test, privacy architecture. |
| **About** | Purpose, architecture, loaded model metadata, limitations. |

## Deep links (real inference, useful for screenshots)
* `http://127.0.0.1:8000/#analyzer?text=<url-encoded message>` — analyses on load.
* `http://127.0.0.1:8000/#lab?expected=SCAM&run=1&text=<message>` — runs the Mutation Lab on load.

## Screenshots
`.\scripts\screenshots.ps1` (app must be running) captures the screenshots in `docs/screenshots/` with headless
Microsoft Edge. Manual alternative: browser at 1440 px width, Windows + Shift + S, one capture per tab.

## Offline demonstration
1. Start the app while online or offline; it needs no network either way.
2. Disable Wi-Fi (Windows: Action Center → Wi-Fi off) or unplug Ethernet.
3. Analyse any message; open Privacy Center → *Run offline prediction test*. The browser badge turns to "offline".
4. Optional OS evidence in PowerShell:
   `Get-NetTCPConnection -State Established | Where-Object RemoteAddress -notin '127.0.0.1','::1'` filtered by the
   Python process id — no entries are expected for the backend.
