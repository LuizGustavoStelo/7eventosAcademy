
# Complete project BOM audit
# Searches for:
# 1. BOM at file start (EF BB BF = 239 187 191)
# 2. BOM character embedded in text (U+FEFF = ZERO WIDTH NO-BREAK SPACE)
# 3. Replacement character U+FFFD
# 4. Files saved as UTF-16 or UTF-32 with BOM

$BasePath = "c:\Dev\Projects\7EventosAcademy"
$excludePattern = "node_modules|\\\.git\\|dist\\|build\\|\\\.next\\|\\\.cache\\|vendor\\|package-lock|\\\.pdf$|\\\.png$|\\\.jpg$|\\\.jpeg$|\\\.ico$|\\\.gif$|\\\.woff2?$|\\\.ttf$|\\\.eot$|\\\.map$|\\\.mp4$|\\\.webm$|\\\.otf$"

Write-Host "=== Full BOM Audit ==="
Write-Host "Base: $BasePath"
Write-Host ""

$bomStart = @()
$bomMiddle = @()
$replChar = @()
$utf16 = @()
$feffAsText = @()

$count = 0

Get-ChildItem $BasePath -Recurse -File | Where-Object {
    $_.FullName -notmatch $excludePattern -and $_.Length -lt 10000000
} | ForEach-Object {
    $f = $_
    $count++
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        if ($bytes.Length -lt 2) { return }
        
        # UTF-16 LE BOM: FF FE
        if ($bytes[0] -eq 255 -and $bytes[1] -eq 254) {
            $utf16 += "UTF-16LE: $($f.FullName)"
            return
        }
        # UTF-16 BE BOM: FE FF
        if ($bytes[0] -eq 254 -and $bytes[1] -eq 255) {
            $utf16 += "UTF-16BE: $($f.FullName)"
            return
        }
        
        if ($bytes.Length -lt 3) { return }
        
        # UTF-8 BOM at start
        if ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
            $bomStart += $f.FullName
            return
        }
        
        # Skip binary files (check for many null bytes in first 512 bytes)
        $checkLen = [Math]::Min(512, $bytes.Length)
        $nullCount = 0
        for ($i = 0; $i -lt $checkLen; $i++) {
            if ($bytes[$i] -eq 0) { $nullCount++ }
        }
        if ($nullCount -gt 5) { return }
        
        # Scan for UTF-8 BOM in middle of file
        $foundBOMMiddle = $false
        $foundREPL = $false
        for ($i = 3; $i -lt ($bytes.Length - 2); $i++) {
            if (-not $foundBOMMiddle -and $bytes[$i] -eq 239 -and $bytes[$i+1] -eq 187 -and $bytes[$i+2] -eq 191) {
                $bomMiddle += "$($f.FullName) [byte $i]"
                $foundBOMMiddle = $true
            }
            if (-not $foundREPL -and $bytes[$i] -eq 239 -and $bytes[$i+1] -eq 191 -and $bytes[$i+2] -eq 189) {
                $replChar += "$($f.FullName) [byte $i]"
                $foundREPL = $true
            }
            if ($foundBOMMiddle -and $foundREPL) { break }
        }
    } catch {}
}

Write-Host "Files scanned: $count"
Write-Host ""

Write-Host "=== UTF-16 Encoded files ==="
if ($utf16.Count -eq 0) { Write-Host "(none)" }
else { $utf16 | ForEach-Object { Write-Host $_ } }

Write-Host ""
Write-Host "=== UTF-8 BOM at START ==="
if ($bomStart.Count -eq 0) { Write-Host "(none)" }
else { $bomStart | ForEach-Object { Write-Host $_ } }

Write-Host ""
Write-Host "=== UTF-8 BOM in MIDDLE ==="
if ($bomMiddle.Count -eq 0) { Write-Host "(none)" }
else { $bomMiddle | ForEach-Object { Write-Host $_ } }

Write-Host ""
Write-Host "=== Replacement Char (U+FFFD, EF BF BD) ==="
if ($replChar.Count -eq 0) { Write-Host "(none)" }
else { $replChar | ForEach-Object { Write-Host $_ } }

Write-Host ""
Write-Host "Done!"
