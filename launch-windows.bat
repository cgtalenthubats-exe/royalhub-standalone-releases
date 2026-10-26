@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
rem Silences the one-time "SQLite is an experimental feature" notice from
rem Node's built-in node:sqlite (used for the local database) - harmless,
rem but not worth it looking like something's wrong on first run.
set NODE_OPTIONS=--disable-warning=ExperimentalWarning
echo Starting RoyalHub Standalone...
echo (Closing this window stops the app.)

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo ============================================================
    echo   Node.js is required but was not found on this computer.
    echo   Download and install it from https://nodejs.org
    echo   (any current version works), then run this file again.
    echo ============================================================
    echo.
    start "" https://nodejs.org
    pause
    exit /b 1
)

rem Confirms the installed Node.js is new enough (this app needs 22.13+ for
rem its built-in database support) before going any further, instead of
rem letting an old version fail confusingly deeper inside npm install.
for /f "delims=" %%v in ('node -v 2>nul') do set NODEVER=%%v
set NODEVER=!NODEVER:v=!
for /f "tokens=1,2 delims=." %%a in ("!NODEVER!") do (
    set NODE_MAJOR=%%a
    set NODE_MINOR=%%b
)
set NODE_OK=0
if !NODE_MAJOR! gtr 22 set NODE_OK=1
if !NODE_MAJOR! equ 22 if !NODE_MINOR! geq 13 set NODE_OK=1
if "!NODE_OK!"=="0" (
    echo.
    echo ============================================================
    echo   Node.js v!NODEVER! was found, but it's too old for this app
    echo   ^(needs v22.13 or later^). Download a newer version from
    echo   https://nodejs.org, then run this file again.
    echo ============================================================
    echo.
    start "" https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js v!NODEVER! found.

rem Checks the public release mirror for a newer version and applies it in
rem place automatically (see scripts\patch.ps1) - no GitHub login involved,
rem works the same whether this copy came from "git clone" or a ZIP
rem download. Never blocks starting the app, even if this check fails (e.g.
rem no internet) - this app is supposed to work fully offline too.
echo Checking for updates...
set PATCHRESULT=
for /f "delims=" %%r in ('powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\patch.ps1" 2^>nul') do set PATCHRESULT=%%r
echo !PATCHRESULT! | findstr /b "PATCHED:" >nul
if not errorlevel 1 echo ==^> Updated to the latest version.
echo !PATCHRESULT! | findstr /b "UP_TO_DATE:" >nul
if not errorlevel 1 echo ==^> Already up to date.
echo !PATCHRESULT! | findstr /b "CHECK_FAILED" >nul
if not errorlevel 1 echo ==^> Could not check for updates ^(no internet?^) - continuing with the current version.
echo !PATCHRESULT! | findstr /b "PATCH_FAILED:" >nul
if not errorlevel 1 echo ==^> Update failed - continuing with the current version. Contact your IT support person if this keeps happening.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\run-install-with-log.ps1"
if errorlevel 1 (
    echo.
    echo ============================================================
    echo   npm install failed. A full log was saved to:
    echo   install-log.txt ^(in this same folder^)
    echo   If you need help, send that file.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 120; $i++) { try { (New-Object Net.Sockets.TcpClient('localhost',3000)).Close(); Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Milliseconds 1000 } }"
call npm run dev
pause
