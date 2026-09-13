@echo off
setlocal
cd /d "%~dp0"

REM Unpackaged runs always use the shortstack-dev profile and never upload, so this is the safe one
REM for trying things out. It will not show your real channel or queue.

echo.
echo   Starting ShortStack against the test profile (nothing can upload).
echo.

call npm run build
if errorlevel 1 goto failed

call npx electron .
exit /b 0

:failed
echo.
echo   The build failed. The error is above.
echo.
pause
exit /b 1
