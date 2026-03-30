@echo off
REM Windows setup script for Linux SRE Environment
REM Run this to set up the project on Windows

echo.
echo ========================================
echo Linux SRE Environment - Windows Setup
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.11+ from https://www.python.org/
    exit /b 1
)

echo [1/4] Python version check... OK
python --version

REM Create virtual environment
echo.
echo [2/4] Creating virtual environment...
if exist venv (
    echo Virtual environment already exists, skipping creation
) else (
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        exit /b 1
    )
)

REM Activate virtual environment
echo.
echo [3/4] Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    exit /b 1
)

REM Install requirements
echo.
echo [4/4] Installing requirements...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install requirements
    exit /b 1
)

REM Display next steps
echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo.
echo 1. Run the demo:
echo    python demo.py
echo.
echo 2. Start the API server:
echo    python -m uvicorn src.server:app --reload
echo    (Open http://localhost:8000/docs for API documentation)
echo.
echo 3. Run tests:
echo    python -m pytest tests/
echo.
echo 4. Deactivate virtual environment when done:
echo    deactivate
echo.
pause
