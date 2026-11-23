# TEKMĒ — Tinyverse PS-01 pitch deck

| File | What it is |
|---|---|
| `TEKME_Tinyverse_Final_Presentation.pptx` | The editable deck: 7 slides, 16:9, with speaker notes. All text, the architecture diagram and the chart are native PowerPoint objects. |
| `TEKME_Tinyverse_Final_Presentation.pdf` | The same deck exported by Microsoft PowerPoint. |
| `src/build_deck.js` | Generator (pptxgenjs). Reads every metric from `../reports/*.json` and the model file size at build time; no number is typed in by hand. |
| `src/prepare_assets.js` | Builds the logo, icons, Athena images and screenshot crops into `assets/build/`. |
| `src/render_wordmarks.ps1`, `src/wordmarks.html` | Render the TEKMĒ wordmark and tagline with the website's own bundled fonts (Cinzel, Cormorant Garamond). |
| `src/render.ps1` | Opens the deck in PowerPoint, exports the PDF and one PNG per slide (`render/`) for visual QA. |
| `src/apply_theme.js` | Writes the deck's theme colours and fonts (Georgia headings, Calibri body). |
| `assets/raw/` | 2× screenshots of the running website (headless Edge, `http://127.0.0.1:8000`). |

The slide order follows `PPT Format.pdf`: Title, Problem and existing solutions, Proposed solution, Tech stack,
Architecture, Impact, and Results with future scope.

## Rebuild

```powershell
cd presentation
npm install                                              # pptxgenjs, sharp, react, react-dom, react-icons
node src/prepare_assets.js
powershell -ExecutionPolicy Bypass -File src/render_wordmarks.ps1
node src/build_deck.js
powershell -ExecutionPolicy Bypass -File src/render.ps1  # needs Microsoft PowerPoint
```

To refresh the screenshots, start the app (`.\run.ps1`) and re-capture `assets/raw/*.png` at 1440 px CSS width and 2× scale.

## Sources of every claim

* Accuracy, F1, ROC-AUC, ECE, false-positive rate, Test B, disguise benchmark, genuine-OTP subset: `reports/metrics.json`
* In-browser latency: `reports/web_performance.json` (developer laptop; varies with power state, see KNOWN_ISSUES K14)
* Browser/Python parity: `reports/parity_report.json`
* Dataset size, sources and synthetic share: `reports/dataset_report.json`
* iPhone filter: source code only (`ios/`); not built or tested on a device, and shown as future scope.
* Athena artwork: user-supplied images generated for TEKMĒ (see DECISIONS D29), used unmodified apart from resizing.
