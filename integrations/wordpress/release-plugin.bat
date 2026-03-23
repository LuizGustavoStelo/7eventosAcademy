@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM ============================================================
REM  7Eventos Academy - Release do Plugin WordPress
REM  release-plugin.bat
REM ============================================================

set REPO=LuizGustavoStelo/7eventosAcademy
set ACADEMY_URL=https://academy.7eventos.com
set PLUGIN_DIR=%~dp07academy
set MANDATORY=false

echo.
echo  ============================================================
echo   7Eventos Academy - Publicar Nova Versao do Plugin WordPress
echo  ============================================================
echo.

REM Verificar pre-requisitos
where gh >nul 2>&1
if errorlevel 1 (
    echo [ERRO] GitHub CLI nao encontrado. Instale em: https://cli.github.com/
    goto :fim_erro
)

where curl >nul 2>&1
if errorlevel 1 (
    echo [ERRO] curl nao encontrado. Atualize o Windows ou instale manualmente.
    goto :fim_erro
)

where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERRO] PowerShell nao encontrado.
    goto :fim_erro
)

REM Coletar dados
set /p VERSION="Versao da release (ex: 1.0.1): "
if "%VERSION%"=="" (
    echo [ERRO] Versao nao informada.
    goto :fim_erro
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
    goto :fim_erro
)

REM Nomes de arquivos
set ZIP_NAME=7academy-%VERSION%.zip
set ZIP_PATH=%~dp0%ZIP_NAME%
set TAG=v%VERSION%

echo.
echo  [1/4] Gerando ZIP do plugin...
echo        Origem:  %PLUGIN_DIR%
echo        Destino: %ZIP_PATH%
echo.

REM Remove ZIP anterior se existir
if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"

REM Cria o ZIP usando PowerShell
powershell -NoProfile -Command "Compress-Archive -Path '%PLUGIN_DIR%' -DestinationPath '%ZIP_PATH%' -Force"

if not exist "%ZIP_PATH%" (
    echo [ERRO] Falha ao gerar o ZIP.
    goto :fim_erro
)

echo  [OK] ZIP gerado: %ZIP_NAME%

REM Criar release no GitHub
echo.
echo  [2/4] Criando GitHub Release %TAG%...

set RELEASE_NOTES=Release %VERSION% do plugin 7academy para WordPress.

if not "%CHANGELOG%"=="" (
    set RELEASE_NOTES=%CHANGELOG%
)

gh release create "%TAG%" --repo "%REPO%" --title "Plugin 7academy v%VERSION%" --notes "%RELEASE_NOTES%" "%ZIP_PATH%#7academy-%VERSION%.zip"

if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao criar a release no GitHub. Verifique a tag ou permissoes.
    goto :fim_erro
)

echo  [OK] Release criada no GitHub.

REM Obter URL do asset
echo.
echo  [3/4] Obtendo URL do asset no GitHub...

for /f "delims=" %%U in ('gh release view "%TAG%" --repo "%REPO%" --json assets --jq ".assets[] ^| select(.name == '%ZIP_NAME%') ^| .browserDownloadUrl"') do (
    set PACKAGE_URL=%%U
)

if "%PACKAGE_URL%"=="" (
    echo [AVISO] Nao foi possivel obter a URL automaticamente.
    set /p PACKAGE_URL="Cole aqui a URL de download do ZIP no GitHub: "
)

echo  [OK] URL: %PACKAGE_URL%

REM Cadastrar release na API da Academy
echo.
echo  [4/4] Registrando release na API da Academy...

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

curl -s -o "%TEMP%\academy_response.json" -w "%%{http_code}" -X POST "%ACADEMY_URL%/api/wordpress/admin/releases" -H "Authorization: Bearer %ACADEMY_TOKEN%" -H "Content-Type: application/json" --data-binary "@%JSON_TEMP%" > "%TEMP%\academy_status.txt"

set /p HTTP_STATUS=<"%TEMP%\academy_status.txt"

if "%HTTP_STATUS%"=="200" goto :api_ok
if "%HTTP_STATUS%"=="201" goto :api_ok

echo.
echo [ERRO] API retornou HTTP %HTTP_STATUS%.
echo        Resposta:
type "%TEMP%\academy_response.json"
echo.
echo        Registre manualmente com os dados gerados.
goto :fim_erro

:api_ok
echo  [OK] Release registrada na Academy com sucesso!

REM Limpeza
del /f /q "%ZIP_PATH%" >nul 2>&1
del /f /q "%JSON_TEMP%" >nul 2>&1
del /f /q "%TEMP%\academy_response.json" >nul 2>&1
del /f /q "%TEMP%\academy_status.txt" >nul 2>&1

REM Resumo final
echo.
echo  ============================================================
echo   CONCLUIDO COM SUCESSO!
echo  ============================================================
echo.
echo   Versao publicada : %VERSION%
echo   Tag GitHub       : %TAG%
echo   Package URL      : %PACKAGE_URL%
echo.
echo   O WordPress vai detectar a atualizacao automaticamente.
echo.
goto :fim_sucesso

:fim_erro
echo.
echo Operacao interrompida devido a erro. O prompt ficara aberto.
pause
exit /b 1

:fim_sucesso
pause
exit /b 0
