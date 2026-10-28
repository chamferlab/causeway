@echo off
rem Serve Causeway (scripts\serve.py). Plain HTTP for a trusted office network.
rem
rem   scripts\run_app.bat                 http://127.0.0.1:8080/ (this machine only)
rem   scripts\run_app.bat --lan           also reachable from the network
rem   scripts\run_app.bat --port 9000
rem
rem Thin wrapper around scripts\serve.py, shared with Linux (run_app.sh).
rem Works from any directory or by double-click. Needs Python 3.8 or later; nothing else.
setlocal

rem Prefer the py launcher from python.org; fall back to python on PATH.
set "PYTHON="
where py >nul 2>&1 && set "PYTHON=py -3"
if not defined PYTHON where python >nul 2>&1 && set "PYTHON=python"
if not defined PYTHON (
    echo Causeway: Python not found - install Python 3.8 or later from python.org.
    pause
    exit /b 1
)

%PYTHON% "%~dp0serve.py" %*
if errorlevel 1 (
    echo.
    echo Causeway stopped with an error - see the messages above.
    pause
    exit /b 1
)
exit /b 0
