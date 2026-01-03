@echo off
title Stop NIM Proxy
color 0C

echo ========================================
echo         STOPPING NIM PROXY
echo ========================================
echo.

echo Killing processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Killing processes on port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping Cloudflare tunnel...
taskkill /F /IM cloudflared.exe /T >nul 2>&1

echo.
echo ========================================
echo         PROXY STOPPED!
echo ========================================
echo.
echo All processes terminated.
echo.
timeout /t 2
exit
