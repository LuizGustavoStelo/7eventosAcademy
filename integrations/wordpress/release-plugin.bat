@echo off
chcp 65001 >nul
REM ============================================================
REM  7Eventos Academy - Release do Plugin WordPress (AUTO)
REM  Inicia o script em PowerShell para evitar problemas
REM  com caracteres especiais (como ! ou &) na senha do .env
REM ============================================================

echo.
echo  ============================================================
echo   7Eventos Academy - Publicar Nova Versao do Plugin WordPress
echo  ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0release-plugin.ps1"

if %errorlevel% neq 0 (
    echo.
    echo  Operacao interrompida.
    pause
    exit /b %errorlevel%
)

echo.
pause
exit /b 0
