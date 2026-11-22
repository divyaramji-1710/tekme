# Reproduce the full ML pipeline: download -> prepare -> augment -> train -> evaluate.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:PYTHONIOENCODING = "utf-8"
$py = ".\.venv\Scripts\python.exe"
& $py scripts\download_data.py;   if ($LASTEXITCODE) { exit 1 }
& $py ml\datasets\prepare.py;     if ($LASTEXITCODE) { exit 1 }
& $py ml\datasets\augment.py;     if ($LASTEXITCODE) { exit 1 }
& $py ml\training\train.py;       if ($LASTEXITCODE) { exit 1 }
& $py ml\evaluation\evaluate.py;  if ($LASTEXITCODE) { exit 1 }
