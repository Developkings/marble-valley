# Draws the app icon into every Android size: a low-poly marble on stone steps.
# Run it again after changing the drawing: powershell -File scripts/make-icon.ps1
Add-Type -AssemblyName System.Drawing

$res = Join-Path $PSScriptRoot '..\android\app\src\main\res'
$back = '#F3D9C9'

function Brush([string]$hex) { New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($hex)) }

function Poly($g, [string]$hex, [double[]]$xy, $scale, $ox, $oy) {
  $points = for ($i = 0; $i -lt $xy.Length; $i += 2) { New-Object Drawing.PointF ([float]($ox + $xy[$i] * $scale)), ([float]($oy + $xy[$i + 1] * $scale)) }
  $g.FillPolygon((Brush $hex), [Drawing.PointF[]]$points)
}

# One block: its centre, half its width, and how tall it stands.
function Block($g, $cx, $cy, $w, $h, $top, $left, $right, $scale, $ox, $oy) {
  $d = $w / 2
  Poly $g $left @(($cx - $w), $cy, $cx, ($cy + $d), $cx, ($cy + $d + $h), ($cx - $w), ($cy + $h)) $scale $ox $oy
  Poly $g $right @(($cx + $w), $cy, $cx, ($cy + $d), $cx, ($cy + $d + $h), ($cx + $w), ($cy + $h)) $scale $ox $oy
  Poly $g $top @($cx, ($cy - $d), ($cx + $w), $cy, $cx, ($cy + $d), ($cx - $w), $cy) $scale $ox $oy
}

# The drawing fills a square of 100, scaled and placed as asked.
function Scene($g, $scale, $ox, $oy) {
  Block $g 64 30 25 46 '#EFC0A6' '#C98F76' '#A9705C' $scale $ox $oy
  Block $g 36 58 25 20 '#F6D2BB' '#D89F86' '#B57E69' $scale $ox $oy

  # The marble, in facets lit from the upper left.
  $cx = 36; $cy = 42; $r = 15
  $ring = 0..7 | ForEach-Object { $a = [Math]::PI / 4 * $_ + [Math]::PI / 8; , @(($cx + $r * [Math]::Cos($a)), ($cy + $r * [Math]::Sin($a))) }
  $mid = 0..3 | ForEach-Object { $a = [Math]::PI / 2 * $_ + [Math]::PI / 8 + [Math]::PI; , @(($cx - 3 + 6 * [Math]::Cos($a)), ($cy - 3 + 6 * [Math]::Sin($a))) }
  $shades = @('#39436A', '#39436A', '#47527C', '#5D6A96', '#7E8BB4', '#7E8BB4', '#5D6A96', '#47527C')
  for ($i = 0; $i -lt 8; $i++) {
    $p = $ring[$i]; $q = $ring[($i + 1) % 8]
    Poly $g $shades[$i] @($cx, $cy, $p[0], $p[1], $q[0], $q[1]) $scale $ox $oy
  }
  Poly $g '#A9B5D6' @($mid[0][0], $mid[0][1], $mid[1][0], $mid[1][1], $mid[2][0], $mid[2][1], $mid[3][0], $mid[3][1]) $scale $ox $oy
  Poly $g '#E9EEF8' @(($cx - 5), ($cy - 7), ($cx - 1), ($cy - 8), ($cx - 2), ($cy - 4)) $scale $ox $oy
}

function NewPicture($size) {
  $bitmap = New-Object Drawing.Bitmap $size, $size, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([Drawing.Color]::Transparent)
  return @($bitmap, $g)
}

function Save($bitmap, $g, $path) {
  $g.Dispose()
  $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

foreach ($density in @(@('mdpi', 48), @('hdpi', 72), @('xhdpi', 96), @('xxhdpi', 144), @('xxxhdpi', 192))) {
  $dir = Join-Path $res "mipmap-$($density[0])"
  $size = $density[1]

  # Phones that mask the icon themselves: the drawing has to keep inside the middle 61% of a larger square.
  $full = [int]($size * 108 / 48)
  $bitmap, $g = NewPicture $full
  $scale = $full * 0.61 / 100
  Scene $g $scale ($full * 0.195) ($full * 0.195)
  Save $bitmap $g (Join-Path $dir 'ic_launcher_foreground.png')

  # Older phones show these as they are.
  $bitmap, $g = NewPicture $size
  $g.FillRectangle((Brush $back), 0, 0, $size, $size)
  Scene $g ($size * 0.8 / 100) ($size * 0.1) ($size * 0.1)
  Save $bitmap $g (Join-Path $dir 'ic_launcher.png')

  $bitmap, $g = NewPicture $size
  $g.FillEllipse((Brush $back), 0, 0, $size, $size)
  Scene $g ($size * 0.68 / 100) ($size * 0.16) ($size * 0.16)
  Save $bitmap $g (Join-Path $dir 'ic_launcher_round.png')
}

[IO.File]::WriteAllText((Join-Path $res 'values\ic_launcher_background.xml'), "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$back</color>`n</resources>`n")

# The PC window and the program's own icon use the same drawing.
$bitmap, $g = NewPicture 512
$g.FillRectangle((Brush $back), 0, 0, 512, 512)
Scene $g 4.1 25 25
Save $bitmap $g (Join-Path $PSScriptRoot '..\desktop\icon.png')
