$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent -Path $MyInvocation.MyCommand.Path

$REPO = "LuizGustavoStelo/7eventosAcademy"
$ACADEMY_URL = "https://academy.7eventos.com"
$PLUGIN_DIR = Join-Path $ScriptDir "7academy"
$MANDATORY = $false
$MIN_WP = "6.0"
$MIN_PHP = "8.0"

Write-Host ""
Write-Host " ===========================================================" -ForegroundColor Cyan
Write-Host "  7Eventos Academy - Publicar Nova Versao do Plugin WordPress" -ForegroundColor Cyan
Write-Host " ===========================================================" -ForegroundColor Cyan
Write-Host ""

# ──────────────────────────────────────────────────────────
# 1. Checagem de ferramentas
# ──────────────────────────────────────────────────────────
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERRO] GitHub CLI nao encontrado. Instale em: https://cli.github.com/" -ForegroundColor Red
    exit 1
}

# ──────────────────────────────────────────────────────────
# 2. Ler .env local e Autenticar na Academy API
# ──────────────────────────────────────────────────────────
$EnvFile = Join-Path $ScriptDir "release-plugin.env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERRO] Arquivo de configuracao nao encontrado: release-plugin.env" -ForegroundColor Red
    Write-Host " Crie o arquivo com o conteudo:"
    Write-Host "   ACADEMY_EMAIL=seu_email@aqui.com"
    Write-Host "   ACADEMY_PASSWORD=sua_senha_aqui"
    exit 1
}

# Parse simples do .env
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if (-not $key.StartsWith("#")) {
            $envVars[$key] = $value
        }
    }
}

$Email = $envVars["ACADEMY_EMAIL"]
$Password = $envVars["ACADEMY_PASSWORD"]

if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    Write-Host "[ERRO] ACADEMY_EMAIL ou ACADEMY_PASSWORD ausentes no release-plugin.env" -ForegroundColor Red
    exit 1
}

Write-Host " Realizando login na Academy API ($Email)..." -ForegroundColor Yellow

try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json -Depth 2

    # Importante: usar TLS 1.2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $loginResponse = Invoke-RestMethod -Uri "$ACADEMY_URL/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $AcademyToken = $loginResponse.accessToken

    if ([string]::IsNullOrWhiteSpace($AcademyToken)) {
        throw "Token nao retornado pela API."
    }
    Write-Host " [OK] Login bem-sucedido!" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Falha ao fazer login na Academy. Verifique email/senha no .env." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# ──────────────────────────────────────────────────────────
# 3. Detectar última versão e Auto-incrementar
# ──────────────────────────────────────────────────────────
Write-Host "`n Detectando ultima versao no GitHub..." -ForegroundColor Yellow

$ghOutput = gh release list --repo $REPO --limit 1 --json tagName --jq ".[0].tagName" 2>$null

$LastVersion = ""
if ($null -ne $ghOutput) {
    if ($ghOutput -is [array]) { $ghOutput = $ghOutput -join "" }
    $LastVersion = $ghOutput.Trim()
}

if (-not [string]::IsNullOrWhiteSpace($LastVersion)) {
    $LastVersion = $LastVersion.TrimStart('v')
}

if ([string]::IsNullOrWhiteSpace($LastVersion)) {
    $NewVersion = "1.0.0"
    Write-Host " Nenhuma versao anterior identificada. Comecando com v1.0.0"
} else {
    Write-Host " Ultima versao encontrada: $LastVersion"
    
    $parts = $LastVersion.Split('.')
    if ($parts.Length -ne 3) {
        Write-Host "[ERRO] Formato de versao desconhecido ($LastVersion). Precisa ser x.y.z" -ForegroundColor Red
        exit 1
    }

    [int]$maj = $parts[0]
    [int]$min = $parts[1]
    [int]$pat = $parts[2]

    $pat += 1
    if ($pat -ge 100) {
        $pat = 0
        $min += 1
    }
    if ($min -ge 100) {
        $min = 0
        $maj += 1
    }

    $NewVersion = "$maj.$min.$pat"
    Write-Host " Nova versao calculada: $NewVersion" -ForegroundColor Green
}

$ZipName = "7academy-${NewVersion}.zip"
$ZipPath = Join-Path $ScriptDir $ZipName
$Tag = "v$NewVersion"
$ChangelogUrl = "https://github.com/$REPO/releases/tag/$Tag"

$PluginMainFile = Join-Path $PLUGIN_DIR "7academy.php"
if (Test-Path $PluginMainFile) {
    $content = Get-Content $PluginMainFile
    $content = $content -replace "\* Version:\s*\d+\.\d+\.\d+", "* Version: $NewVersion"
    $content = $content -replace "define\('SEVEN_ACADEMY_VERSION',\s*'\d+\.\d+\.\d+'\);", "define('SEVEN_ACADEMY_VERSION', '$NewVersion');"
    [IO.File]::WriteAllText($PluginMainFile, ($content -join "`r`n") + "`r`n", [System.Text.Encoding]::UTF8)
    Write-Host " Atualizado 7academy.php para a versao $NewVersion" -ForegroundColor Green
}

Write-Host "`n ===========================================================" -ForegroundColor Cyan
Write-Host "  Publicando versao: $NewVersion" -ForegroundColor Cyan
Write-Host " ===========================================================" -ForegroundColor Cyan

# ──────────────────────────────────────────────────────────
# 4. ZIP do Plugin
# ──────────────────────────────────────────────────────────
Write-Host "`n [1/4] Gerando ZIP do plugin..."

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Write-Host " Usando tar.exe para gerar zip compativel com Linux..."
Push-Location $ScriptDir
& tar.exe -a -c -f $ZipName 7academy
Pop-Location

if (-not (Test-Path $ZipPath)) {
    Write-Host "[ERRO] Falha ao criar arquivo ZIP." -ForegroundColor Red
    exit 1
}
Write-Host " [OK] ZIP gerado: $ZipName" -ForegroundColor Green

# ──────────────────────────────────────────────────────────
# 5. Criar Release no GitHub
# ──────────────────────────────────────────────────────────
Write-Host "`n [2/4] Criando GitHub Release ($Tag)..."

$releaseNotes = "Release v$NewVersion do plugin 7academy para WordPress."
$assetArg = "$ZipPath#$ZipName"

& gh release create "$Tag" --repo "$REPO" --title "Plugin 7academy v$NewVersion" --notes "$releaseNotes" "$assetArg"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao criar release no GitHub via gh cli." -ForegroundColor Red
    exit 1
}
Write-Host " [OK] Release do GitHub publicada." -ForegroundColor Green

# ──────────────────────────────────────────────────────────
# 6. Capturar URL do Asset
# ──────────────────────────────────────────────────────────
Write-Host "`n [3/4] Obtendo URL de download autenticada..."

$assetJson = gh release view "$Tag" --repo "$REPO" --json assets --jq ".assets[0].browserDownloadUrl" 2>$null
$PackageUrl = $assetJson.Trim()

if ([string]::IsNullOrWhiteSpace($PackageUrl)) {
    Write-Host "[AVISO] Nao foi possivel identificar a browserDownloadUrl. Usando url default de prevencao." -ForegroundColor DarkYellow
    $PackageUrl = "https://github.com/$REPO/releases/latest/download/$ZipName"
}

Write-Host " [OK] URL: $PackageUrl" -ForegroundColor Green

# ──────────────────────────────────────────────────────────
# 7. Registrar na Academy API
# ──────────────────────────────────────────────────────────
Write-Host "`n [4/4] Registrando release na API da Academy..."

try {
    $releaseBody = @{
        version = $NewVersion
        packageUrl = $PackageUrl
        isPublished = $true
        isMandatory = $MANDATORY
        minWpVersion = $MIN_WP
        minPhpVersion = $MIN_PHP
        changelogUrl = $ChangelogUrl
    } | ConvertTo-Json -Depth 2

    $headers = @{
        "Authorization" = "Bearer $AcademyToken"
    }

    $apiResponse = Invoke-RestMethod -Uri "$ACADEMY_URL/api/wordpress/admin/releases" -Method Post -Body $releaseBody -Headers $headers -ContentType "application/json"

    Write-Host " [OK] Release registrada com sucesso na base de dados!" -ForegroundColor Green

} catch {
    Write-Host "[ERRO] Falha na comunicacao com a API Academy." -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    } else {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    
    Write-Host "`n[Aviso] O Github release foi criado e o Zip anexado." -ForegroundColor DarkYellow
    Write-Host "[Aviso] Porem como a API falhou, adicione no painel com estas configuracoes:" -ForegroundColor DarkYellow
    Write-Host " Versao: $NewVersion"
    Write-Host " URL: $PackageUrl"
    exit 1
}

# ──────────────────────────────────────────────────────────
# Limpeza
# ──────────────────────────────────────────────────────────
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Write-Host "`n ===========================================================" -ForegroundColor Cyan
Write-Host "  CONCLUIDO COM SUCESSO!" -ForegroundColor Green
Write-Host " ===========================================================" -ForegroundColor Cyan
Write-Host " Versao Publicada : $NewVersion"
Write-Host " Package URL      : $PackageUrl"
Write-Host "`n O WordPress detectara a atualizacao em alguns instantes.`n"
