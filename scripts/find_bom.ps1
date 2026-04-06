
param(
    [string]$BasePath = "c:\Dev\Projects\7EventosAcademy\resources\templates"
)

Write-Host "=== BOM Scanner for: $BasePath ==="
Write-Host ""

$results = @()

Get-ChildItem $BasePath -Recurse -File | ForEach-Object {
    $f = $_
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        if ($bytes.Length -lt 3) { return }
        
        $b0 = $bytes[0]
        $b1 = $bytes[1]
        $b2 = $bytes[2]
        
        # 239 = 0xEF, 187 = 0xBB, 191 = 0xBF
        if ($b0 -eq 239 -and $b1 -eq 187 -and $b2 -eq 191) {
            $results += "BOM_START: $($f.FullName) ($($f.Length) bytes)"
        }
    } catch {}
}

if ($results.Count -eq 0) {
    Write-Host "No BOM found at start of any file."
} else {
    Write-Host "=== FILES WITH BOM AT START ==="
    $results | ForEach-Object { Write-Host $_ }
    Write-Host ""
    Write-Host "Total: $($results.Count) files with BOM"
}

# Also scan native tsx files
Write-Host ""
Write-Host "=== Also scanning frontend/src/native ==="
$results2 = @()
Get-ChildItem "c:\Dev\Projects\7EventosAcademy\apps\frontend\src\native" -File | ForEach-Object {
    $f = $_
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        if ($bytes.Length -lt 3) { return }
        if ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
            $results2 += "BOM_START: $($f.FullName) ($($f.Length) bytes)"
        }
    } catch {}
}
if ($results2.Count -eq 0) { Write-Host "(none)" }
else { $results2 | ForEach-Object { Write-Host $_ } }
