Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile('D:\code\englishdrive\englishdrive.png')
$resources = 'D:\code\englishdrive\apps\mobile\android\app\src\main\res'
function Export-Icon($path, $size, $inset) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($source, $inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset))
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}
foreach ($density in @(@('mdpi',48,108),@('hdpi',72,162),@('xhdpi',96,216),@('xxhdpi',144,324),@('xxxhdpi',192,432))) {
  $directory = Join-Path $resources ('mipmap-' + $density[0])
  Export-Icon (Join-Path $directory 'ic_launcher.png') $density[1] 0
  Export-Icon (Join-Path $directory 'ic_launcher_round.png') $density[1] 0
  Export-Icon (Join-Path $directory 'ic_launcher_foreground.png') $density[2] ([int]($density[2] / 6))
}
$source.Dispose()
