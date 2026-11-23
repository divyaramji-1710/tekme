# Opens the deck in Microsoft PowerPoint (COM), exports the PDF and one PNG per slide for visual QA.
# Usage: powershell -ExecutionPolicy Bypass -File presentation\src\render.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$deck = (Resolve-Path (Join-Path $here "..")).Path
$pptx = Join-Path $deck "TEKME_Tinyverse_Final_Presentation.pptx"
$pdf = Join-Path $deck "TEKME_Tinyverse_Final_Presentation.pdf"
$png = Join-Path $deck "render"
New-Item -ItemType Directory -Force $png | Out-Null
Get-ChildItem $png -Filter "slide-*.png" | Remove-Item
$app = New-Object -ComObject PowerPoint.Application
try {
  # Open(FileName, ReadOnly, Untitled, WithWindow)
  $p = $app.Presentations.Open($pptx, -1, 0, 0)
  $p.SaveAs($pdf, 32)  # ppSaveAsPDF
  $i = 0
  foreach ($s in $p.Slides) { $i++; $s.Export((Join-Path $png ("slide-{0}.png" -f $i)), "PNG", 1920, 1080) }
  "slides: $($p.Slides.Count)"
  $p.Close()
} finally { $app.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
