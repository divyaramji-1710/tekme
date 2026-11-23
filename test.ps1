# TEKMĒ automated tests: Python suite, frontend suite (parity, analysis, behaviour, UI, contrast),
# production build and the offline-asset scan.
# Native tools write warnings to stderr; Windows PowerShell 5.1 would treat that as fatal under "Stop",
# so failures are detected from exit codes instead.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
.\.venv\Scripts\python.exe -m pytest -v -rs @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location frontend
npx vitest run;          if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run build;           if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run check:offline;   $code = $LASTEXITCODE
Pop-Location
exit $code
