@echo off
rem Update Causeway running as an NSSM service: stop, pull, start again.
rem
rem   scripts\update.bat                  service "Causeway" (or CAUSEWAY_SERVICE)
rem   scripts\update.bat MyServiceName
rem
rem Run from an administrator Command Prompt (or right-click > Run as
rem administrator): nssm needs it to stop and start the service.
rem There is nothing to back up: RCAs are files on each person's computer.
setlocal
for %%I in ("%~dp0..") do set "REPO_DIR=%%~fI"

set "SERVICE=%~1"
if not defined SERVICE set "SERVICE=%CAUSEWAY_SERVICE%"
if not defined SERVICE set "SERVICE=Causeway"

rem --- Checks before anything is stopped -------------------------------------
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
nssm status "%SERVICE%" >nul 2>&1
if errorlevel 1 (
    echo Causeway: there is no service "%SERVICE%". Give its name: scripts\update.bat ^<service name^>,
    echo or install it with scripts\install_service.bat.
    goto end_fail
)
where git >nul 2>&1
if errorlevel 1 (
    echo Causeway: git was not found on the PATH.
    goto end_fail
)

cd /d "%REPO_DIR%"
set "CHANGES="
for /f "delims=" %%L in ('git status --porcelain --untracked-files^=no') do set "CHANGES=1"
if defined CHANGES (
    echo Causeway: files in "%REPO_DIR%" were edited on this machine; git pull would refuse or mix them in:
    git status --short --untracked-files=no
    echo Nothing was stopped or changed.
    goto end_fail
)
for /f "delims=" %%H in ('git rev-parse HEAD') do set "OLD_HEAD=%%H"

rem --- Stop, pull, start -----------------------------------------------------
echo.
echo == Stopping service %SERVICE%
nssm stop "%SERVICE%"

echo.
echo == Pulling the latest version
git pull --ff-only
if errorlevel 1 (
    echo Causeway: git pull failed - the code was not changed.
    goto start_old
)
echo.
echo Changes in this update:
for /f %%C in ('git rev-list --count %OLD_HEAD%..HEAD') do if "%%C"=="0" echo    ^(none: already up to date^)
git log --oneline %OLD_HEAD%..HEAD

echo.
echo == Starting service %SERVICE%
nssm start "%SERVICE%"
if errorlevel 1 (
    echo.
    echo Causeway: the service did not start - see "%REPO_DIR%\logs\causeway.log"
    echo To go back to the previous version:
    echo     git reset --hard %OLD_HEAD%
    echo     nssm start "%SERVICE%"
    goto end_fail
)
echo.
echo Causeway is updated and running again. People get the new version when they reload the page.
pause
exit /b 0

:start_old
echo Starting the service again with the version it had.
nssm start "%SERVICE%"
goto end_fail

:end_fail
echo.
echo Update did not finish - see the messages above.
pause
exit /b 1
