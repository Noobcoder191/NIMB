@echo off
title NIM Proxy Launcher
color 0A

echo ========================================
echo            NIM PROXY
echo ========================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo Creating .env file...
    echo NIM_API_KEY=> .env
    echo .env file created. You can set your API key in the Control Panel.
    echo.
)

echo Current directory: %CD%
echo.
echo Starting proxy server...
echo.

REM Start the Node.js server
start "NIM Proxy Server" cmd /k "npm start"

echo Waiting for server to start...
timeout /t 4 /nobreak >nul

echo.
echo Starting Cloudflare tunnel...
echo.

REM Start Cloudflare tunnel
start "Cloudflare Tunnel" cmd /k "echo Starting Cloudflare Tunnel... && echo. && echo COPY THE URL BELOW: && echo. && cloudflared tunnel --url http://localhost:3000"

echo.
echo ========================================
echo        PROXY IS NOW RUNNING!
echo ========================================
echo.
echo Control Panel: http://localhost:3001
echo Proxy API:     http://localhost:3000/v1/chat/completions
echo.
echo Set your API key in the Control Panel if not configured.
echo.
echo ========================================
echo.
timeout /t 2 /nobreak >nul

REM Open control panel
start http://localhost:3001

echo Press any key to close this window...
pause >nul
