@echo off
rem Install Causeway as an NSSM service that starts with Windows. Safe to run again:
rem an existing service is set up afresh and restarted, for example to change the port.
rem
rem   scripts\install_service.bat                 service "Causeway" on port 8080
rem   scripts\install_service.bat MyServiceName 9000
rem
rem Run from an administrator Command Prompt (or right-click > Run as administrator).
rem The service runs scripts\serve.py --lan with Python 3.8 or later, writes its log to
rem logs\causeway.log, and is allowed through the Windows firewall on its port.
rem Update it later with scripts\update.bat.
setlocal
for %%I in ("%~dp0..") do set "REPO_DIR=%%~fI"

set "SERVICE=%~1"
if not defined SERVICE set "SERVICE=%CAUSEWAY_SERVICE%"
if not defined SERVICE set "SERVICE=Causeway"
set "PORT=%~2"
if not defined PORT set "PORT=8080"

rem --- Checks before anything is changed -------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo Causeway: run this as administrator ^(right-click the Command Prompt ^> Run as administrator^).
    goto end_fail
)
where nssm >nul 2>&1
if errorlevel 1 (
    echo Causeway: nssm was not found on the PATH.
    goto end_fail
)
if not exist "%REPO_DIR%\index.html" (
    echo Causeway: "%REPO_DIR%\index.html" is missing.
    goto end_fail
)
rem The service needs the full path of python.exe, not the py launcher.
set "PYTHON="
for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON=%%P"
if not defined PYTHON for /f "delims=" %%P in ('python -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON=%%P"
if not defined PYTHON (
    echo Causeway: Python not found - install Python 3.8 or later from python.org.
    goto end_fail
)
"%PYTHON%" -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>&1
if errorlevel 1 (
    echo Causeway: "%PYTHON%" is older than Python 3.8.
    goto end_fail
)

rem --- Install or set up afresh ----------------------------------------------
echo Service:  %SERVICE%
echo Python:   %PYTHON%
echo Folder:   %REPO_DIR%
echo Port:     %PORT%
echo.
nssm status "%SERVICE%" >nul 2>&1
if errorlevel 1 (
    echo == Installing service %SERVICE%
    nssm install "%SERVICE%" "%PYTHON%" >nul || goto end_fail
) else (
    echo == Service %SERVICE% exists: stopping it to set it up again
    nssm stop "%SERVICE%" >nul 2>&1
    nssm set "%SERVICE%" Application "%PYTHON%" >nul || goto end_fail
)
if not exist "%REPO_DIR%\logs" mkdir "%REPO_DIR%\logs"
nssm set "%SERVICE%" AppParameters "scripts\serve.py --lan --port %PORT%" >nul || goto end_fail
nssm set "%SERVICE%" AppDirectory "%REPO_DIR%" >nul || goto end_fail
nssm set "%SERVICE%" DisplayName "Causeway" >nul
nssm set "%SERVICE%" Description "Causeway root cause analysis workbench, served on port %PORT%" >nul
nssm set "%SERVICE%" Start SERVICE_AUTO_START >nul
nssm set "%SERVICE%" AppStdout "%REPO_DIR%\logs\causeway.log" >nul
nssm set "%SERVICE%" AppStderr "%REPO_DIR%\logs\causeway.log" >nul
nssm set "%SERVICE%" AppRotateFiles 1 >nul
nssm set "%SERVICE%" AppRotateBytes 1048576 >nul
rem Python buffers its output when it is not a console; this sends the log lines as they come.
nssm set "%SERVICE%" AppEnvironmentExtra PYTHONUNBUFFERED=1 >nul

echo == Allowing port %PORT% through the firewall
powershell -NoProfile -Command "if (-not (Get-NetFirewallRule -DisplayName 'Causeway (TCP %PORT%)' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'Causeway (TCP %PORT%)' -Direction Inbound -Protocol TCP -LocalPort %PORT% -Action Allow -Profile Domain,Private | Out-Null }"
if errorlevel 1 echo    The firewall rule could not be added; see "Open the firewall" in the README.

echo == Starting service %SERVICE%
nssm start "%SERVICE%"
if errorlevel 1 (
    echo Causeway: the service did not start - see "%REPO_DIR%\logs\causeway.log"
    goto end_fail
)
echo.
echo Causeway is running: http://localhost:%PORT%/ here, http://%COMPUTERNAME%:%PORT%/ on the network.
pause
exit /b 0

:end_fail
echo.
echo Install did not finish - see the messages above.
pause
exit /b 1
