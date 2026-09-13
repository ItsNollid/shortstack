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

REM The installer in dist\ is NOT refreshed by this script: --dir skips building one. Saying
REM here is cheaper than wondering why an old build keeps coming back.
if exist "dist\ShortStack Setup 1.0.0.exe" (
  echo.
  echo   Note: "dist\ShortStack Setup 1.0.0.exe" is an old installer that this script does not
  echo   update. Do not open it. It is safe to delete.
)

set COMMIT=unknown
for /f "delims=" %%C in ('git rev-parse --short HEAD 2^>nul') do set COMMIT=%%C

echo.
echo   Built commit %COMMIT% at %DATE% %TIME%
echo   Starting dist\win-unpacked\ShortStack.exe
echo   This is the packaged build, so it uses your real profile and your real channel.
echo   Settings, under "This app", shows the build it is running.
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
