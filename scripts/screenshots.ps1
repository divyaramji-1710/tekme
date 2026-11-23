# Capture the TEKMĒ screenshot set from the running app (start .\run.ps1 first). Uses scripts\shot.ps1.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$b = "http://127.0.0.1:8000"
$kyc = [uri]::EscapeDataString("Dear SBI customer, your KYC has expired and your account will be blocked within 24 hours. Update immediately: http://sbi-kyc-verify.example/login")
$shots = [ordered]@{
  "01_home_dark" = @("$b/?theme=dark#/", 1400); "02_home_light" = @("$b/?theme=light#/", 1400)
  "03_analyzer_scam_dark" = @("$b/?theme=dark#/analyze?text=$kyc", 2300); "06_forensics_light" = @("$b/?theme=light#/forensics?text=$kyc", 2000)
  "07_conversation_dark" = @("$b/?theme=dark#/conversation", 1900); "08_adversarial_lab_light" = @("$b/?theme=light#/lab", 2600)
  "09_model_intelligence_dark" = @("$b/?theme=dark#/model", 3800); "10_threat_library_light" = @("$b/?theme=light#/library", 1500)
  "11_privacy_dark" = @("$b/?theme=dark#/privacy", 1900); "12_iphone_light" = @("$b/?theme=light#/iphone", 1500); "13_settings_dark" = @("$b/?theme=dark#/settings", 1700)
}
foreach ($k in $shots.Keys) { & .\scripts\shot.ps1 -Url $shots[$k][0] -Out "docs\screenshots\$k.png" -Height $shots[$k][1] }
# Phone-width captures (390 px) need a server without frame-ancestors; see docs/TESTING.md.
