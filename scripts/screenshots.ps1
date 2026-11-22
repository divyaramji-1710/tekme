# Capture real screenshots of the running app with headless Microsoft Edge (no extra downloads).
# Start the app first (.\run.ps1), then run: .\scripts\screenshots.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$base = "http://127.0.0.1:8000/"
$enc = { param($s) [uri]::EscapeDataString($s) }
$shots = [ordered]@{
  "01_analyzer_empty"   = "#analyzer"
  "02_scam_kyc"         = "#analyzer?text=" + (& $enc "Dear SBI customer, your KYC has expired and your account will be blocked within 24 hours. Update immediately: http://sbi-kyc-verify.example/login")
  "03_genuine_otp"      = "#analyzer?text=" + (& $enc "483921 is your OTP for login to NetBanking. Valid for 5 minutes. Do not share this OTP with anyone. Bank staff will never ask for it.")
  "04_hinglish_scam"    = "#analyzer?text=" + (& $enc "Aapka SBI khata aaj band ho jayega. Turant KYC update karein warna account block: http://kyc-update.example/sbi")
  "05_mutation_lab"     = "#lab?expected=SCAM&run=1&text=" + (& $enc "Update your KYC immediately or your account will be blocked today. Click http://kyc-verify.example/login")
  "06_diagnostics"      = "#diagnostics"
  "07_privacy"          = "#privacy"
  "08_about"            = "#about"
}
$profileDir = Join-Path $env:TEMP "scamprint-edge-profile"
foreach ($k in $shots.Keys) {
  $out = Join-Path (Resolve-Path docs\screenshots) "$k.png"
  $args = @("--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=`"$profileDir`"", "--hide-scrollbars",
            "--window-size=1440,2200", "--virtual-time-budget=8000", "--screenshot=`"$out`"", "`"$($base + $shots[$k])`"")
  $p = Start-Process -FilePath $edge -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $env:TEMP "scamprint-edge.log")
  if (-not $p.WaitForExit(45000)) { Stop-Process -Id $p.Id -Force; Write-Warning "timed out: $k" }
  Start-Sleep -Milliseconds 500
  Write-Host "saved $out"
}
