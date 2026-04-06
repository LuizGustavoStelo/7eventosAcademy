
# Fix payload.txt - remove BOM properly
$payloadPath = 'c:\Dev\Projects\7EventosAcademy\payload.txt'

Write-Host "Fixing payload.txt..."
$bytes = [System.IO.File]::ReadAllBytes($payloadPath)

# Detect encoding and read content without BOM character
if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    # UTF-16LE with BOM
    $content = [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    Write-Host "Was UTF-16LE with BOM"
} elseif ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    # UTF-8 with BOM - read the content after the BOM
    $content = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    Write-Host "Was UTF-8 with BOM"
} else {
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    Write-Host "Was UTF-8 without BOM (no change needed)"
}

# Remove any remaining BOM character (U+FEFF) from content
$content = $content.TrimStart([char]0xFEFF)

# Write as pure UTF-8 without BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($payloadPath, $content, $utf8NoBom)

# Verify
$newBytes = [System.IO.File]::ReadAllBytes($payloadPath)
$firstHex = ($newBytes[0..5] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
Write-Host "After fix - first 6 bytes: $firstHex"

if ($newBytes[0] -eq 0xEF -and $newBytes[1] -eq 0xBB -and $newBytes[2] -eq 0xBF) {
    Write-Host "ERROR: Still has UTF-8 BOM!"
} elseif ($newBytes[0] -eq 0xFF -and $newBytes[1] -eq 0xFE) {
    Write-Host "ERROR: Still UTF-16!"
} else {
    Write-Host "OK: Now UTF-8 without BOM"
    Write-Host "Content preview: $([System.Text.Encoding]::UTF8.GetString($newBytes).Substring(0, [Math]::Min(80, $newBytes.Length)))"
}
