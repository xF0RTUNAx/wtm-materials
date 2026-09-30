# Журнал боёв онлайн-сервера — скопировать на рабочий стол, чтобы прислать для разбора.
# Запуск (обычный PowerShell):  powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\logs.ps1 [-Date 2026-10-01]
# Без -Date — за сегодня. Журнал хранится 14 дней: game-server\logs\ГГГГ-ММ-ДД.jsonl
param([string]$Date = (Get-Date -Format "yyyy-MM-dd"))
$Dir = Join-Path $PSScriptRoot "..\logs"
$f = Join-Path $Dir "$Date.jsonl"
if (-not (Test-Path $f)) {
  Write-Host "Журнала за $Date нет. Есть за:" -ForegroundColor Yellow
  Get-ChildItem $Dir -Filter *.jsonl -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("  " + $_.BaseName) }
  exit 1
}
$dst = Join-Path ([Environment]::GetFolderPath("Desktop")) "letka-log-$Date.jsonl"
Copy-Item $f $dst -Force
Write-Host "Журнал скопирован на рабочий стол: $dst" -ForegroundColor Green
Write-Host "Пришлите этот файл — по нему видно, что происходило в боях." -ForegroundColor Green
