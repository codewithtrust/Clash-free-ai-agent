@echo off
setlocal
cd /d "%~dp0"

echo Starting ClashFree API on http://127.0.0.1:8000 ...
start "ClashFree API" cmd /k "cd /d ""%~dp0backend"" && python -m uvicorn app.main:app --reload --port 8000"

echo Starting ClashFree web app on http://localhost:5173 ...
start "ClashFree Web" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
endlocal
