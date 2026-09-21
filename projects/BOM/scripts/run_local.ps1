# Costed BOM Comparison — local demo (no Docker)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example (LLM_PROVIDER=none)"
}

if (-not (Test-Path "samples\stacked_costbooks_demo.parquet")) {
    Write-Host "Exporting samples from xlsm..."
    python scripts/export_excel_tables.py
}

$venv = Join-Path $Root "backend\.venv"
if (-not (Test-Path $venv)) {
    Write-Host "Creating Python venv..."
    python -m venv $venv
}
& "$venv\Scripts\pip.exe" install -q -r backend/requirements.txt

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..."
    Push-Location frontend
    npm install
    Pop-Location
}

Write-Host ""
Write-Host "Starting backend on http://localhost:8010"
Write-Host "Starting frontend on http://localhost:3010"
Write-Host "Press Ctrl+C in each terminal to stop."
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; & '$venv\Scripts\python.exe' -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload"
Start-Sleep -Seconds 2
Set-Location frontend
npm run dev
