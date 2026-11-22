# Start SCAMPRINT fully offline: one local process serves the API and the built UI.
# Open http://127.0.0.1:8000 in your browser. Use -Dev for the Vite dev server on :5173.
param([switch]$Dev)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ml\artifacts\scamprint_bundle.joblib)) { throw "Model bundle missing - run .\setup.ps1 first" }
if ($Dev) {
  Start-Process -NoNewWindow -FilePath .\.venv\Scripts\python.exe -ArgumentList "-m", "backend.main"
  Push-Location frontend; npm run dev; Pop-Location
} else {
  if (-not (Test-Path frontend\dist\index.html)) { Push-Location frontend; npm run build; Pop-Location }
  Write-Host "SCAMPRINT running at http://127.0.0.1:8000  (Ctrl+C to stop)" -ForegroundColor Cyan
  .\.venv\Scripts\python.exe -m backend.main
}
