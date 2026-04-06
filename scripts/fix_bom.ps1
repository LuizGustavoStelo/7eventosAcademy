
# Fix all encoding issues found in the project:
# 1. payload.txt: UTF-16LE -> UTF-8
# 2. .editorconfig: has mixed CRLF (\r\n) on line 18
# 3. .gitattributes: has mixed CRLF (\r\n) on line 9

Write-Host "=== Fixing encoding issues ==="

# ---- Fix 1: payload.txt (UTF-16LE -> UTF-8 without BOM) ----
$payloadPath = 'c:\Dev\Projects\7EventosAcademy\payload.txt'
Write-Host "1. Converting payload.txt from UTF-16LE to UTF-8..."
try {
    $bytes = [System.IO.File]::ReadAllBytes($payloadPath)
    $content = [System.Text.Encoding]::Unicode.GetString($bytes)
    # Write back as UTF-8 without BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($payloadPath, $content, $utf8NoBom)
    Write-Host "   OK: payload.txt is now UTF-8"
} catch {
    Write-Host "   ERROR: $_"
}

# ---- Fix 2: .editorconfig (normalize line endings to LF) ----
$editorconfigPath = 'c:\Dev\Projects\7EventosAcademy\.editorconfig'
Write-Host "2. Normalizing .editorconfig line endings to LF..."
try {
    $content = [System.IO.File]::ReadAllText($editorconfigPath, [System.Text.Encoding]::UTF8)
    $fixed = $content -replace "`r`n", "`n" -replace "`r", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($editorconfigPath, $fixed, $utf8NoBom)
    Write-Host "   OK: .editorconfig line endings normalized"
} catch {
    Write-Host "   ERROR: $_"
}

# ---- Fix 3: .gitattributes (normalize line endings to LF) ----
$gitattribPath = 'c:\Dev\Projects\7EventosAcademy\.gitattributes'
Write-Host "3. Normalizing .gitattributes line endings to LF..."
try {
    $content = [System.IO.File]::ReadAllText($gitattribPath, [System.Text.Encoding]::UTF8)
    $fixed = $content -replace "`r`n", "`n" -replace "`r", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($gitattribPath, $fixed, $utf8NoBom)
    Write-Host "   OK: .gitattributes line endings normalized"
} catch {
    Write-Host "   ERROR: $_"
}

Write-Host ""
Write-Host "=== Done! All fixes applied. ==="

# Verify results
Write-Host ""
Write-Host "=== Verification ==="

$payloadBytes = [System.IO.File]::ReadAllBytes($payloadPath)
Write-Host "payload.txt first 4 bytes: $(($payloadBytes[0..3] | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')"
if ($payloadBytes[0] -eq 0xEF -and $payloadBytes[1] -eq 0xBB -and $payloadBytes[2] -eq 0xBF) {
    Write-Host "  -> UTF-8 with BOM (unexpected)"
} elseif ($payloadBytes[0] -eq 0xFF -and $payloadBytes[1] -eq 0xFE) {
    Write-Host "  -> Still UTF-16LE (ERROR - not fixed)"
} else {
    Write-Host "  -> UTF-8 without BOM (correct)"
}
