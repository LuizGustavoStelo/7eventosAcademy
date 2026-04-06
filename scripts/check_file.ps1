
$file = 'c:\Dev\Projects\7EventosAcademy\integrations\wordpress\7academy\7academy.php'
$bytes = [System.IO.File]::ReadAllBytes($file)
Write-Host "File: $file"
Write-Host "Size: $($bytes.Length) bytes"
$hexFirst = ($bytes[0..([Math]::Min(9, $bytes.Length-1))] | ForEach-Object { "{0:X2}" -f $_ }) -join " "
Write-Host "First 10 bytes hex: $hexFirst"
if ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
    Write-Host ">>> HAS BOM AT START <<<"
} else {
    Write-Host "No BOM at start"
}
