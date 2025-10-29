@echo off
echo 🚀 Starting Navigation HUD Project...

REM Create venv if not exists
if not exist venv (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate venv
call venv\Scripts\activate

REM Install dependencies
echo 📥 Installing dependencies...
pip install --upgrade pip
pip install -r requirements.txt

REM Run Flask
echo 🌐 Running Flask server at http://127.0.0.1:5000
flask --app app run --debug
