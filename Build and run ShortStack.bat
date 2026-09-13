@echo off
setlocal
cd /d "%~dp0"

REM ShortStack keeps running in the tray when its window is closed, and while it runs it holds
REM dist\win-unpacked open. electron-builder then fails with EBUSY, this script stops, and
REM double-clicking the exe afterwards starts the same old build again. So: close it first.

REM Absolute paths on purpose. A machine with Git Bash on PATH resolves a bare "find" to GNU find,
REM which does not understand /I and reports nothing running, so the check would quietly pass.
"%SystemRoot%\System32\tasklist.exe" /FI "IMAGENAME eq ShortStack.exe" 2>nul | "%SystemRoot%\System32\find.exe" /I "ShortStack.exe" >nul
if errorlevel 1 goto build

echo.
echo   ShortStack is already running, probably in the tray. Closing it so the build can replace it.
"%SystemRoot%\System32\taskkill.exe" /IM ShortStack.exe /T /F >nul 2>&1

REM Windows releases the folder a moment after the processes go. Wait for it rather than racing.
set /a WAITED=0
:waitloop
"%SystemRoot%\System32\tasklist.exe" /FI "IMAGENAME eq ShortStack.exe" 2>nul | "%SystemRoot%\System32\find.exe" /I "ShortStack.exe" >nul
if errorlevel 1 goto closed
if %WAITED% GEQ 20 goto stillrunning
"%SystemRoot%\System32\ping.exe" -n 2 127.0.0.1 >nul
set /a WAITED+=1
goto waitloop

:closed
"%SystemRoot%\System32\ping.exe" -n 3 127.0.0.1 >nul

:build
echo.
echo   Building ShortStack...
echo.

call npm run build
if errorlevel 1 goto failed

REM --dir skips the installer: it just refreshes dist\win-unpacked, which is much quicker.
call npx electron-builder --win --dir
if errorlevel 1 goto failed

if not exist "dist\win-unpacked\ShortStack.exe" goto missing

REM The installer is NOT refreshed by this script, because --dir never builds one. It sits in
REM dist looking like the newest thing in the folder while staying frozen at whenever it was made.
if exist "dist\ShortStack Setup 1.0.0.exe" (
  echo.
  echo   Note: "dist\ShortStack Setup 1.0.0.exe" is an old installer this script does not
  echo   update. Do not open it. It is safe to delete.
)

set COMMIT=unknown
for /f "delims=" %%C in ('git rev-parse --short HEAD 2^>nul') do set COMMIT=%%C

echo.
echo   Built commit %COMMIT% at %DATE% %TIME%
echo   Starting dist\win-unpacked\ShortStack.exe
echo   This is the packaged build, so it uses your real profile and your real channel.
echo   Settings, under "This app", shows the build it is running. Check it matches the commit above.
echo.

start "" "dist\win-unpacked\ShortStack.exe"
exit /b 0

:stillrunning
echo.
echo   ShortStack would not close. Quit it from the tray icon, then run this again.
echo.
pause
exit /b 1

:failed
echo.
echo   The build failed. The error is above.
echo   If it mentions a file being in use, something else has the app open. Close it and try again.
echo.
pause
exit /b 1

:missing
echo.
echo   The build finished but dist\win-unpacked\ShortStack.exe is not there.
echo.
pause
exit /b 1
