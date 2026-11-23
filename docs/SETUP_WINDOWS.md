# Setup on Windows

Tested on Windows 11, Python 3.12.10, Node 24.15 / npm 11.12, Microsoft Edge. CPU only.

## One-time setup (needs internet once)
```powershell
git clone <your repo>  ;  cd tinyverse-scam_detection
.\setup.ps1            # creates .venv, installs requirements.txt, npm install, npm run build
```
The trained model and the exported browser model are in the repository, so no training is needed to run the app.
To rebuild everything from the public datasets (~20 minutes): `.\setup.ps1 -Train` or `.\scripts\train_all.ps1`.

## Run
```powershell
.\run.ps1              # http://127.0.0.1:8000  (FastAPI serves the built UI; the model runs in the browser)
.\run.ps1 -Dev         # Vite dev server with hot reload on http://127.0.0.1:5173
```
Because inference happens in the browser, the built `frontend/dist` folder can also be served by any static web
server; the Python process is optional.

## Test
```powershell
.\test.ps1             # pytest (Python) + vitest (parity, analysis, behaviour, UI/accessibility, contrast, perf)
                       # + production build + offline-asset scan
```
Individual parts: `.\.venv\Scripts\python -m pytest -q`, `cd frontend; npx vitest run`, `npm run check:offline`.

## Screenshots of the running app
```powershell
.\run.ps1                                     # in one terminal
.\scripts\shot.ps1 -Url "http://127.0.0.1:8000/?theme=dark#/" -Out docs\screenshots\home_dark.png
```
`?theme=dark|light` forces a theme for that page load.

## Notes
* Set `PYTHONIOENCODING=utf-8` when printing non-ASCII text in a Windows console (the scripts do this).
* Latency depends on power state (battery / Balanced plan can be several times slower) — KNOWN_ISSUES K14.
