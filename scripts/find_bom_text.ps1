
# This script finds the U+FEFF (BOM/Zero-Width No-Break Space) character embedded as text 
# in source files - this is what shows up as "?" when BOM is included as text content
# Also finds U+FFFD (Replacement Character)

$BasePath = "c:\Dev\Projects\7EventosAcademy"
$excludePattern = "node_modules|\.git|dist|build|\.next|\.cache|vendor|package-lock|\.pdf|\.png|\.jpg|\.ico|\.gif|\.woff|\.woff2|\.ttf|\.eot|\.map"

Write-Host "=== Searching for BOM-as-text (U+FEFF) and Replacement chars (U+FFFD) ==="
Write-Host "Base: $BasePath"
Write-Host ""

$FEFF = [char]0xFEFF
$FFFD = [char]0xFFFD

$foundFEFF = @()
$foundFFFF = @()

Get-ChildItem $BasePath -Recurse -File | Where-Object {
    $_.FullName -notmatch $excludePattern -and $_.Length -lt 5000000
} | ForEach-Object {
    $f = $_
    try {
        # Try reading as UTF-8 without BOM (so we get the raw text content)
        $reader = [System.IO.StreamReader]::new($f.FullName, [System.Text.Encoding]::UTF8, $false)
        $content = $reader.ReadToEnd()
        $reader.Close()
        
        if ($content.Contains($FEFF)) {
            $lines = $content -split "`n"
            $lineNums = @()
            for ($i = 0; $i -lt $lines.Length; $i++) {
                if ($lines[$i].Contains($FEFF)) {
                    $lineNums += ($i + 1)
                }
            }
            $foundFEFF += "$($f.FullName) [lines: $($lineNums -join ',')]"
        }
        
        if ($content.Contains($FFFD)) {
            $foundFFFF += $f.FullName
        }
    } catch {}
}

Write-Host "=== Files with U+FEFF (BOM character in text content) ==="
if ($foundFEFF.Count -eq 0) { Write-Host "(none)" }
else { $foundFEFF | ForEach-Object { Write-Host $_ } }

Write-Host ""
Write-Host "=== Files with U+FFFD (Replacement Character) ==="
if ($foundFFFF.Count -eq 0) { Write-Host "(none)" }
else { $foundFFFF | ForEach-Object { Write-Host $_ } }

Write-Host ""
Write-Host "Done!"
