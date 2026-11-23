# Capture one screenshot of the running app with headless Microsoft Edge.
# Usage: .\scripts\shot.ps1 -Url "http://127.0.0.1:8000/?theme=dark#/" -Out docs\screenshots\x.png [-Width 1536] [-Height 1024]
param([Parameter(Mandatory)] [string]$Url, [Parameter(Mandatory)] [string]$Out, [int]$Width = 1536, [int]$Height = 1024, [int]$Budget = 9000)
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$profileDir = Join-Path $env:TEMP "tekme-edge-profile"
$outPath = [System.IO.Path]::GetFullPath($Out)
$a = @("--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=`"$profileDir`"", "--hide-scrollbars",
       "--window-size=$Width,$Height", "--virtual-time-budget=$Budget", "--screenshot=`"$outPath`"", "`"$Url`"")
$p = Start-Process -FilePath $edge -ArgumentList $a -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $env:TEMP "tekme-edge.log")
if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; Write-Warning "timed out: $Url" } else { Write-Host "saved $outPath" }
