@echo off
setlocal

:: ===== CONFIG =====
set SERVICE_NAME=MonitorTicketV2_Camera
set APP_DIR=C:\server_disnibra\MonitorTicketV2_Camera
set NODE_EXE=node
set INSTALL_SCRIPT=install-service.js

echo ======================================
echo Reinstalando servico: %SERVICE_NAME%
echo ======================================

:: Verifica admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERRO: Execute este arquivo como ADMINISTRADOR
    pause
    exit /b 1
)

:: Para o servico (se existir)
echo Parando servico...
sc stop %SERVICE_NAME% >nul 2>&1
timeout /t 2 /nobreak >nul

:: Deleta o servico antigo
echo Removendo servico antigo...
sc delete %SERVICE_NAME% >nul 2>&1
timeout /t 2 /nobreak >nul

:: Instala novamente
echo Instalando servico...
cd /d %APP_DIR%
"%NODE_EXE%" %INSTALL_SCRIPT%
timeout /t 2 /nobreak >nul

:: Inicia o servico
echo Iniciando servico...
sc start %SERVICE_NAME% >nul 2>&1

:: Mostra status final
echo.
sc query %SERVICE_NAME%

echo.
echo ======================================
echo Processo finalizado
echo ======================================
pause
