@echo off
setlocal
cd /d "%~dp0"

echo.
echo   Building ShortStack...
echo.

call npm run build
if errorlevel 1 goto failed

REM --dir skips the installer: it just refreshes dist\win-unpacked, which is much quicker.
call npx electron-builder --win --dir
if errorlevel 1 goto failed

if not exist "dist\win-unpacked\ShortStack.exe" goto missing

echo.
echo   Starting ShortStack.
echo   This is the packaged build, so it uses your real profile and your real channel.
echo.

start "" "dist\win-unpacked\ShortStack.exe"
exit /b 0

:failed
echo.
echo   The build failed. The error is above.
echo   If it mentions a file being in use, close ShortStack and run this again.
echo.
pause
exit /b 1

:missing
echo.
echo   The build finished but dist\win-unpacked\ShortStack.exe is not there.
echo.
pause
exit /b 1
