@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
::  7Eventos Academy — Release do Plugin WordPress
::  release-plugin.bat
::
::  O que este script faz:
::    1. Pede a versão da release (ex: 1.0.1)
::    2. Gera o ZIP do plugin (pasta 7academy/)
::    3. Cria uma GitHub Release e sobe o ZIP como asset
::    4. Cadastra a nova release na API da Academy
::
::  Pré-requisitos:
::    - GitHub CLI instalado: https://cli.github.com/
::    - Autenticado no gh: gh auth login
::    - curl disponível (já vem no Windows 10+)
::    - Token de superadmin da Academy (solicitado no script)
:: ============================================================

set REPO=LuizGustavoStelo/7eventosAcademy
set ACADEMY_URL=https://academy.7eventos.com
set PLUGIN_DIR=%~dp0\7academy
set MANDATORY=false

echo.
echo  ============================================================
echo   7Eventos Academy — Publicar Nova Versao do Plugin WordPress
echo  ============================================================
echo.

:: ── Verificar pré-requisitos ─────────────────────────────────
where gh >nul 2>&1
if errorlevel 1 (
    echo [ERRO] GitHub CLI nao encontrado.
    echo        Instale em: https://cli.github.com/
    pause
    exit /b 1
)

where curl >nul 2>&1
if errorlevel 1 (
    echo [ERRO] curl nao encontrado. Atualize o Windows ou instale manualmente.
    pause
    exit /b 1
)

where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERRO] PowerShell nao encontrado.
    pause
    exit /b 1
)

:: ── Coletar dados ────────────────────────────────────────────
set /p VERSION="Versao da release (ex: 1.0.1): "
if "%VERSION%"=="" (
    echo [ERRO] Versao nao informada.
    pause
    exit /b 1
)

set /p MINOR_WP="Versao minima do WordPress (ex: 6.0, Enter para pular): "
set /p MINOR_PHP="Versao minima do PHP (ex: 8.0, Enter para pular): "
set /p CHANGELOG="Descricao resumida das mudancas (aparece no changelog): "

set /p IS_MANDATORY="Esta versao e obrigatoria? (s/N): "
if /i "%IS_MANDATORY%"=="s" set MANDATORY=true

echo.
set /p ACADEMY_TOKEN="Token do superadmin da Academy (Bearer): "
if "%ACADEMY_TOKEN%"=="" (
    echo [ERRO] Token nao informado.
    pause
    exit /b 1
)

:: ── Nomes de arquivos ────────────────────────────────────────
set ZIP_NAME=7academy-%VERSION%.zip
set ZIP_PATH=%~dp0%ZIP_NAME%
set TAG=v%VERSION%

echo.
echo  [1/4] Gerando ZIP do plugin...
echo        Origem:  %PLUGIN_DIR%
echo        Destino: %ZIP_PATH%
echo.

:: Remove ZIP anterior se existir
if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"

:: Cria o ZIP usando PowerShell (sem depender de 7zip)
powershell -NoProfile -Command ^
  "Compress-Archive -Path '%PLUGIN_DIR%' -DestinationPath '%ZIP_PATH%' -Force"

if not exist "%ZIP_PATH%" (
    echo [ERRO] Falha ao gerar o ZIP.
    pause
    exit /b 1
)

echo  [OK] ZIP gerado: %ZIP_NAME%

:: ── Criar release no GitHub ──────────────────────────────────
echo.
echo  [2/4] Criando GitHub Release %TAG%...

set RELEASE_NOTES=Release %VERSION% do plugin 7academy para WordPress.

if not "%CHANGELOG%"=="" (
    set RELEASE_NOTES=%CHANGELOG%
)

gh release create "%TAG%" ^
    --repo "%REPO%" ^
    --title "Plugin 7academy v%VERSION%" ^
    --notes "%RELEASE_NOTES%" ^
    "%ZIP_PATH%#7academy-%VERSION%.zip"

if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao criar a release no GitHub.
    echo        Verifique se a tag %TAG% ja existe ou se voce tem permissao.
    pause
    exit /b 1
)

echo  [OK] Release criada no GitHub.

:: ── Obter URL do asset ───────────────────────────────────────
echo.
echo  [3/4] Obtendo URL do asset no GitHub...

for /f "delims=" %%U in ('gh release view "%TAG%" --repo "%REPO%" --json assets --jq ".assets[] | select(.name == \"%ZIP_NAME%\") | .browserDownloadUrl"') do (
    set PACKAGE_URL=%%U
)

if "%PACKAGE_URL%"=="" (
    echo [AVISO] Nao foi possivel obter a URL automaticamente.
    set /p PACKAGE_URL="Cole aqui a URL de download do ZIP no GitHub: "
)

echo  [OK] URL: %PACKAGE_URL%

:: ── Montar JSON do payload ───────────────────────────────────
set JSON_PAYLOAD={
set JSON_PAYLOAD=%JSON_PAYLOAD% "version": "%VERSION%",
set JSON_PAYLOAD=%JSON_PAYLOAD% "packageUrl": "%PACKAGE_URL%",
set JSON_PAYLOAD=%JSON_PAYLOAD% "isPublished": true,
set JSON_PAYLOAD=%JSON_PAYLOAD% "isMandatory": %MANDATORY%

if not "%MINOR_WP%"=="" (
    set JSON_PAYLOAD=%JSON_PAYLOAD%, "minWpVersion": "%MINOR_WP%"
)
if not "%MINOR_PHP%"=="" (
    set JSON_PAYLOAD=%JSON_PAYLOAD%, "minPhpVersion": "%MINOR_PHP%"
)
if not "%CHANGELOG%"=="" (
    set JSON_PAYLOAD=%JSON_PAYLOAD%, "changelogUrl": "https://github.com/%REPO%/releases/tag/%TAG%"
)

set JSON_PAYLOAD=%JSON_PAYLOAD%}

:: Escrever JSON num arquivo temp para evitar problemas com caracteres especiais
set JSON_TEMP=%TEMP%\7academy_release_%VERSION%.json
(
echo {
echo   "version": "%VERSION%",
echo   "packageUrl": "%PACKAGE_URL%",
echo   "isPublished": true,
echo   "isMandatory": %MANDATORY%,
echo   "minWpVersion": "%MINOR_WP%",
echo   "minPhpVersion": "%MINOR_PHP%",
echo   "changelogUrl": "https://github.com/%REPO%/releases/tag/%TAG%"
echo }
) > "%JSON_TEMP%"

:: ── Cadastrar release na API da Academy ──────────────────────
echo.
echo  [4/4] Registrando release na API da Academy...

curl -s -o "%TEMP%\academy_response.json" -w "%%{http_code}" ^
    -X POST "%ACADEMY_URL%/api/wordpress/admin/releases" ^
    -H "Authorization: Bearer %ACADEMY_TOKEN%" ^
    -H "Content-Type: application/json" ^
    --data-binary "@%JSON_TEMP%" ^
    > "%TEMP%\academy_status.txt"

set /p HTTP_STATUS=<"%TEMP%\academy_status.txt"

if "%HTTP_STATUS%"=="200" goto :api_ok
if "%HTTP_STATUS%"=="201" goto :api_ok

echo.
echo [ERRO] API retornou HTTP %HTTP_STATUS%.
echo        Resposta:
type "%TEMP%\academy_response.json"
echo.
echo        Release foi criada no GitHub mas NAO foi registrada na Academy.
echo        Registre manualmente:
echo.
echo        curl -X POST "%ACADEMY_URL%/api/wordpress/admin/releases" \
echo          -H "Authorization: Bearer SEU_TOKEN" \
echo          -H "Content-Type: application/json" \
echo          --data-binary "@%JSON_TEMP%"
echo.
pause
exit /b 1

:api_ok
echo  [OK] Release registrada na Academy com sucesso!

:: ── Limpeza ──────────────────────────────────────────────────
del /f /q "%ZIP_PATH%" >nul 2>&1
del /f /q "%JSON_TEMP%" >nul 2>&1
del /f /q "%TEMP%\academy_response.json" >nul 2>&1
del /f /q "%TEMP%\academy_status.txt" >nul 2>&1

:: ── Resumo final ─────────────────────────────────────────────
echo.
echo  ============================================================
echo   CONCLUIDO COM SUCESSO!
echo  ============================================================
echo.
echo   Versao publicada : %VERSION%
echo   Tag GitHub       : %TAG%
echo   Package URL      : %PACKAGE_URL%
echo   Obrigatoria      : %MANDATORY%
echo.
echo   O WordPress vai detectar a atualizacao automaticamente
echo   na proxima verificacao (ate 12h) ou acesse:
echo   Plugins > Verificar atualizacoes
echo.
pause
endlocal
