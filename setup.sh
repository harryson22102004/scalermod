#!/bin/bash
# Linux/Mac setup script for Linux SRE Environment
# Run this to set up the project: chmod +x setup.sh && ./setup.sh

set -e  # Exit on error

echo ""
echo "========================================"
echo "Linux SRE Environment - Setup"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.11+ using: apt-get install python3 python3-venv"
    exit 1
fi

echo "[1/4] Python version check... OK"
python3 --version

# Create virtual environment
echo ""
echo "[2/4] Creating virtual environment..."
if [ -d "venv" ]; then
    echo "Virtual environment already exists, skipping creation"
else
    python3 -m venv venv
fi

# Activate virtual environment
echo ""
echo "[3/4] Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo ""
echo "[4/4] Installing requirements..."
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

# Installation complete
echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Activate virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "2. Run the demo:"
echo "   python demo.py"
echo ""
echo "3. Start the API server:"
echo "   python -m uvicorn src.server:app --reload"
echo "   (Open http://localhost:8000/docs for API documentation)"
echo ""
echo "4. Run tests:"
echo "   python -m pytest tests/ -v"
echo ""
echo "5. Docker deployment:"
echo "   docker build -t linux-sre-env ."
echo "   docker run -p 8000:8000 linux-sre-env"
echo ""
echo "Deactivate virtual environment when done:"
echo "   deactivate"
echo ""
