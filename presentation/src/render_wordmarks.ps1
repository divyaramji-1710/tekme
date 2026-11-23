# Renders the TEKME wordmarks (transparent PNG) with headless Edge using the website's bundled fonts,
# then trims them with sharp. Run from anywhere: powershell -File presentation\src\render_wordmarks.ps1
$ErrorActionPreference = "Stop"
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$deck = (Resolve-Path (Join-Path $here "..")).Path
$out = Join-Path $deck "assets\build"
$html = (Join-Path $here "wordmarks.html").Replace([char]92, [char]47)
$tekme = "TEKM" + [char]0x112
$items = @(
  @{ n = "wm_tekme_dark";  k = "w"; s = $tekme; c = "f0e8e1"; px = 240 },
  @{ n = "wm_tekme_light"; k = "w"; s = $tekme; c = "34150f"; px = 240 },
  @{ n = "wm_tag_dark";    k = "t"; s = "Evidence over instinct."; c = "c9ad99"; px = 170 },
  @{ n = "wm_tag_light";   k = "t"; s = "Evidence over instinct."; c = "85431e"; px = 170 }
)
foreach ($i in $items) {
  $u = "file:///" + $html + "?k=" + $i.k + "&c=" + $i.c + "&px=" + $i.px + "&s=" + [uri]::EscapeDataString($i.s)
  $f = Join-Path $out ($i.n + "_raw.png")
  if (Test-Path $f) { Remove-Item $f }
  $a = @("--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=`"$env:TEMP\tekme-edge-wm`"", "--hide-scrollbars",
         "--default-background-color=00000000", "--window-size=2400,500", "--allow-file-access-from-files",
         "--virtual-time-budget=4000", "--screenshot=`"$f`"", "`"$u`"")
  $p = Start-Process -FilePath $edge -ArgumentList $a -PassThru -WindowStyle Hidden
  $null = $p.WaitForExit(60000)
  if (-not (Test-Path $f)) { throw "Edge did not write $f" }
}
Push-Location $deck
node -e "const s=require('sharp'),p=require('path');(async()=>{for(const n of ['wm_tekme_dark','wm_tekme_light','wm_tag_dark','wm_tag_light']){const r=p.join('assets','build',n+'_raw.png');await s(r).trim({threshold:1}).toFile(p.join('assets','build',n+'.png'));const m=await s(p.join('assets','build',n+'.png')).metadata();console.log(n,m.width,m.height)}})()"
Pop-Location
