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
# сервер «Воздушного превосходства» берёт логику боя из games\airdef — добавляем папку к скачиваемым (один раз; ~55 МБ с моделями)
$sp = git -C $Repo sparse-checkout list 2>$null
if ($LASTEXITCODE -eq 0 -and $sp -and -not ($sp -match 'games/airdef')) { Write-Host "Добавляем папку игры «Воздушное превосходство»..."; git -C $Repo sparse-checkout add fortuna-bot-web/games/airdef }
git -C $Repo pull --ff-only
if ($LASTEXITCODE -ne 0) { Write-Host "git pull не прошёл — код не обновлён." -ForegroundColor Red; exit 1 }
$Svc = "FortunaGame"
$DenoExe = Join-Path $env:ProgramData "FortunaGame\bin\deno.exe"
$env:DENO_DIR = Join-Path $env:ProgramData "FortunaGame\deno"
Write-Host "Готовим модули сервера..."
& $DenoExe cache (Join-Path $PSScriptRoot "..\server.js")
# Перезапуск. Restart-Service зависал на остановке (служба «висит» в StopPending), поэтому: просим остановиться без
# ожидания, ждём до 15 с, не остановилась — завершаем процесс службы принудительно. Сервер (deno) службы завершаем
# в любом случае: иначе старая копия может остаться и держать порт, а новая не запустится.
Write-Host "Перезапускаем сервер..."
$old = Get-CimInstance Win32_Service -Filter "Name='$Svc'"
Stop-Service $Svc -NoWait -ErrorAction SilentlyContinue
for ($i = 0; $i -lt 15 -and (Get-Service $Svc).Status -ne 'Stopped'; $i++) { Start-Sleep 1 }
if ((Get-Service $Svc).Status -ne 'Stopped') {
  Write-Host "Служба не остановилась сама — завершаем принудительно." -ForegroundColor Yellow
  if ($old.ProcessId) { Stop-Process -Id $old.ProcessId -Force -ErrorAction SilentlyContinue }
}
Get-Process deno -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $DenoExe } | Stop-Process -Force -ErrorAction SilentlyContinue
for ($i = 0; $i -lt 10 -and (Get-Service $Svc).Status -ne 'Stopped'; $i++) { Start-Sleep 1 }
# права сервера: журналу боёв (game-server\logs) нужна запись. Ставим при каждом обновлении — у первых установок её не было.
$Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
$Server = (Resolve-Path (Join-Path $PSScriptRoot "..\server.js")).Path
if ($Nssm) { & $Nssm set $Svc AppParameters "run --allow-net --allow-read --allow-write --allow-env `"$Server`"" | Out-Null }
else { Write-Host "Не нашёл nssm — журнал боёв не включится (нет права записи). Запустите install.ps1." -ForegroundColor Yellow }
Start-Service $Svc
Start-Sleep 5
try { $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 5; Write-Host ("Обновлено, сервер работает: " + ($h | ConvertTo-Json -Compress)) -ForegroundColor Green }
catch { Write-Host "Сервер не ответил. Журнал: $env:ProgramData\FortunaGame\logs\server.log" -ForegroundColor Red }
$d = Get-Process deno -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $DenoExe }
if ($d) { Write-Host ("Сервер запущен в " + (($d | ForEach-Object { $_.StartTime.ToString('HH:mm:ss') }) -join ', ')) }
