
$file = 'c:\Dev\Projects\7EventosAcademy\payload.txt'
$bytes = [System.IO.File]::ReadAllBytes($file)
$content = [System.Text.Encoding]::Unicode.GetString($bytes)
Write-Host "Content of payload.txt:"
Write-Host $content
Write-Host ""
Write-Host "File size: $($bytes.Length) bytes"
Write-Host "First 4 bytes hex: $(($bytes[0..3] | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')"
