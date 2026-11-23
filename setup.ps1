# TEKMĒ one-time setup (needs internet ONCE for packages and public datasets).
# Usage:  .\setup.ps1            install deps + build UI (uses the trained model in ml\artifacts)
#         .\setup.ps1 -Train     also download data and retrain all models (~20 min on CPU, incl. browser export and parity check)
param([switch]$Train)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip -q
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -q
Push-Location frontend; npm install --no-audit --no-fund; npm run build; Pop-Location
if ($Train -or -not (Test-Path ml\artifacts\tekme_bundle.joblib)) { & .\scripts\train_all.ps1 }
Write-Host "Setup complete. Start the app with .\run.ps1" -ForegroundColor Green
