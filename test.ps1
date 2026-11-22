# Run the full automated test suite plus the frontend offline-asset check.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
.\.venv\Scripts\python.exe -m pytest -v -rs @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location frontend; npm run check:offline; $code = $LASTEXITCODE; Pop-Location
exit $code
