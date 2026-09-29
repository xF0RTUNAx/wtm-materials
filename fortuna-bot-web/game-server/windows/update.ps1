# Обновление онлайн-сервера: забрать свежий код из GitHub и перезапустить службу.
# Запуск: PowerShell ОТ ИМЕНИ АДМИНИСТРАТОРА:
#   powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\update.ps1
# Перезапуск обрывает идущие бои — если кто-то играет, скрипт спросит (или -Force, чтобы не спрашивал).
param([switch]$Force, [int]$Port = 8787)
$ErrorActionPreference = "Continue"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 5
  if ($h.online -gt 0 -and -not $Force) {
    $a = Read-Host "Сейчас в игре $($h.online) чел., комнат $($h.rooms). Перезапуск оборвёт бои. Продолжить? (да/нет)"
    if ($a -notmatch '^(д|да|y|yes)$') { Write-Host "Отменено."; exit 0 }
  }
} catch { }
git -C $Repo pull --ff-only
if ($LASTEXITCODE -ne 0) { Write-Host "git pull не прошёл — код не обновлён." -ForegroundColor Red; exit 1 }
$env:DENO_DIR = Join-Path $env:ProgramData "FortunaGame\deno"
& (Join-Path $env:ProgramData "FortunaGame\bin\deno.exe") cache (Join-Path $PSScriptRoot "..\server.js")
Restart-Service FortunaGame # встроенная команда Windows: nssm может быть не в PATH старого окна
Start-Sleep 5
try { $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 5; Write-Host ("Обновлено, сервер работает: " + ($h | ConvertTo-Json -Compress)) -ForegroundColor Green }
catch { Write-Host "Сервер не ответил. Журнал: $env:ProgramData\FortunaGame\logs\server.log" -ForegroundColor Red }
