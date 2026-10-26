$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting ClashFree API on http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\backend'; python -m uvicorn app.main:app --reload --port 8000"
)

Write-Host "Starting ClashFree web app on http://localhost:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\frontend'; npm run dev"
)

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
