@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM ============================================================
REM  7Eventos Academy - Release do Plugin WordPress (AUTO)
REM  release-plugin.bat
REM  - Auto-incrementa versao lendo a ultima tag do GitHub
REM  - URL de download via GitHub Releases API (repo privado OK)
REM  - Token da Academy lido de release-plugin.env
REM ============================================================

set REPO=LuizGustavoStelo/7eventosAcademy
set ACADEMY_URL=https://academy.7eventos.com
set PLUGIN_DIR=%~dp07academy
set MANDATORY=false
set MIN_WP=6.0
set MIN_PHP=8.0

echo.
echo  ============================================================
echo   7Eventos Academy - Publicar Nova Versao do Plugin WordPress
echo  ============================================================
echo.

REM ── Pre-requisitos ───────────────────────────────────────────
where gh >nul 2>&1 || (
    echo [ERRO] GitHub CLI nao encontrado. Instale em: https://cli.github.com/
    goto :fim_erro
)

where curl >nul 2>&1 || (
    echo [ERRO] curl nao encontrado.
    goto :fim_erro
)

where powershell >nul 2>&1 || (
    echo [ERRO] PowerShell nao encontrado.
    goto :fim_erro
)

REM ── Token da Academy (lido de arquivo .env local) ────────────
set ENV_FILE=%~dp0release-plugin.env
if not exist "%ENV_FILE%" (
    echo [ERRO] Arquivo de configuracao nao encontrado: release-plugin.env
    echo.
    echo  Crie o arquivo com o conteudo:
    echo    ACADEMY_TOKEN=seu_token_aqui
    echo.
    goto :fim_erro
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if "%%A"=="ACADEMY_TOKEN" set ACADEMY_TOKEN=%%B
)

if "%ACADEMY_TOKEN%"=="" (
    echo [ERRO] ACADEMY_TOKEN nao definido em release-plugin.env
    goto :fim_erro
)

REM ── Auto-detectar ultima versao no GitHub ────────────────────
echo  Detectando ultima versao publicada...

set LAST_VERSION=
for /f "delims=" %%V in ('gh release list --repo "%REPO%" --limit 1 --json tagName --jq ".[0].tagName" 2^>nul') do (
    set LAST_VERSION=%%V
)

REM Remove o "v" do inicio da tag, ex: v1.0.2 -> 1.0.2
if not "%LAST_VERSION%"=="" (
    set LAST_VERSION=!LAST_VERSION:v=!
)

REM Se nao achou nenhuma versao anterior, começa em 1.0.0
if "%LAST_VERSION%"=="" (
    set VERSION=1.0.0
    echo  Nenhuma versao anterior encontrada. Usando 1.0.0
    goto :versao_definida
)

echo  Ultima versao: !LAST_VERSION!

REM ── Auto-incremento: X.Y.Z com carry em 100 ─────────────────
REM Divide a versao nos seus componentes
for /f "tokens=1,2,3 delims=." %%A in ("!LAST_VERSION!") do (
    set MAJ=%%A
    set MIN=%%B
    set PAT=%%C
)

REM Incrementa patch
set /a PAT=!PAT! + 1

REM Carry: patch >= 100 -> incrementa minor, patch = 0
if !PAT! GEQ 100 (
    set PAT=0
    set /a MIN=!MIN! + 1
)

REM Carry: minor >= 100 -> incrementa major, minor = 0
if !MIN! GEQ 100 (
    set MIN=0
    set /a MAJ=!MAJ! + 1
)

set VERSION=!MAJ!.!MIN!.!PAT!
echo  Nova versao calculada: !VERSION!

:versao_definida

set ZIP_NAME=7academy-%VERSION%.zip
set ZIP_PATH=%~dp0%ZIP_NAME%
set TAG=v%VERSION%
set CHANGELOG_URL=https://github.com/%REPO%/releases/tag/%TAG%

echo.
echo  ============================================================
echo   Publicando versao: %VERSION%
echo  ============================================================
echo.

REM ── [1/4] Gerar ZIP ──────────────────────────────────────────
echo  [1/4] Gerando ZIP do plugin...
echo        Origem:  %PLUGIN_DIR%
echo        Destino: %ZIP_PATH%
echo.

if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"

powershell -NoProfile -Command "Compress-Archive -Path '%PLUGIN_DIR%' -DestinationPath '%ZIP_PATH%' -Force"

if not exist "%ZIP_PATH%" (
    echo [ERRO] Falha ao gerar o ZIP.
    goto :fim_erro
)

echo  [OK] ZIP gerado: %ZIP_NAME%

REM ── [2/4] Criar Release no GitHub ────────────────────────────
echo.
echo  [2/4] Criando GitHub Release %TAG%...

gh release create "%TAG%" --repo "%REPO%" --title "Plugin 7academy v%VERSION%" --notes "Release v%VERSION% do plugin 7academy para WordPress." "%ZIP_PATH%#%ZIP_NAME%"

if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao criar a release no GitHub.
    goto :fim_erro
)

echo  [OK] Release criada no GitHub.

REM ── [3/4] Obter URL do asset via GitHub API ───────────────────
echo.
echo  [3/4] Obtendo URL de download...

REM Para repos privados, a URL real (nao o download direto do browser) deve ser
REM obtida via API do GitHub com o token do gh CLI. Usamos a URL de download
REM autenticada via 'gh release download', mas para registrar na Academy
REM usamos a URL padrao que o plugin usara com o token do WordPress.
REM
REM A URL padrao de download do GitHub para o asset mais recente:
set PACKAGE_URL=https://github.com/%REPO%/releases/latest/download/%ZIP_NAME%

REM Confirma que o asset existe consultando a API
for /f "delims=" %%U in ('gh release view "%TAG%" --repo "%REPO%" --json assets --jq ".assets[0].browserDownloadUrl" 2^>nul') do (
    set PACKAGE_URL=%%U
)

echo  [OK] URL: %PACKAGE_URL%

REM ── [4/4] Registrar na Academy API ───────────────────────────
echo.
echo  [4/4] Registrando release na API da Academy...

set JSON_TEMP=%TEMP%\7academy_release_%VERSION%.json
(
echo {
echo   "version": "%VERSION%",
echo   "packageUrl": "%PACKAGE_URL%",
echo   "isPublished": true,
echo   "isMandatory": %MANDATORY%,
echo   "minWpVersion": "%MIN_WP%",
echo   "minPhpVersion": "%MIN_PHP%",
echo   "changelogUrl": "%CHANGELOG_URL%"
echo }
) > "%JSON_TEMP%"

curl -s -o "%TEMP%\academy_response.json" -w "%%{http_code}" -X POST "%ACADEMY_URL%/api/wordpress/admin/releases" -H "Authorization: Bearer %ACADEMY_TOKEN%" -H "Content-Type: application/json" --data-binary "@%JSON_TEMP%" > "%TEMP%\academy_status.txt"

set /p HTTP_STATUS=<"%TEMP%\academy_status.txt"

if "%HTTP_STATUS%"=="200" goto :api_ok
if "%HTTP_STATUS%"=="201" goto :api_ok

echo.
echo [ERRO] API retornou HTTP %HTTP_STATUS%.
echo        Resposta:
type "%TEMP%\academy_response.json"
echo.
goto :fim_erro

:api_ok
del /f /q "%ZIP_PATH%" >nul 2>&1
del /f /q "%JSON_TEMP%" >nul 2>&1
del /f /q "%TEMP%\academy_response.json" >nul 2>&1
del /f /q "%TEMP%\academy_status.txt" >nul 2>&1

echo.
echo  ============================================================
echo   CONCLUIDO COM SUCESSO!
echo  ============================================================
echo.
echo   Versao publicada : %VERSION%
echo   Tag GitHub       : %TAG%
echo   Package URL      : %PACKAGE_URL%
echo.
echo   O WordPress detectara a atualizacao automaticamente.
echo.
goto :fim_sucesso

:fim_erro
echo.
echo  Operacao interrompida. O prompt ficara aberto.
pause
exit /b 1

:fim_sucesso
pause
exit /b 0
