# Reproduce the full ML pipeline: download -> prepare -> augment -> train -> evaluate -> export for the browser,
# model-intelligence artefacts, browser parity reference and the compact iOS model.
# Native tools write warnings to stderr; Windows PowerShell 5.1 would treat that as fatal under "Stop",
# so failures are detected from exit codes instead.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:PYTHONIOENCODING = "utf-8"
$py = ".\.venv\Scripts\python.exe"
& $py scripts\download_data.py;        if ($LASTEXITCODE) { exit 1 }
& $py ml\datasets\prepare.py;          if ($LASTEXITCODE) { exit 1 }
& $py ml\datasets\augment.py;          if ($LASTEXITCODE) { exit 1 }
& $py ml\training\train.py;            if ($LASTEXITCODE) { exit 1 }
& $py ml\evaluation\evaluate.py;       if ($LASTEXITCODE) { exit 1 }
& $py -m ml.analysis.build_intel;      if ($LASTEXITCODE) { exit 1 }
& $py -m ml.export.ios_model;          if ($LASTEXITCODE) { exit 1 }
& $py -m ml.export.parity;             if ($LASTEXITCODE) { exit 1 }
& $py -m ml.export.export_web;         if ($LASTEXITCODE) { exit 1 }
Push-Location frontend; npx vitest run tests/parity.test.ts; $c = $LASTEXITCODE; Pop-Location; if ($c) { exit 1 }
& $py -m ml.export.export_web;         if ($LASTEXITCODE) { exit 1 }   # copies the fresh parity report into the UI
