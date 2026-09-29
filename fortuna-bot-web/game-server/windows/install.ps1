# Онлайн-сервер «Симулятора Летки» — служба Windows (NSSM) на ноутбуке с ботом.
# Запуск: PowerShell ОТ ИМЕНИ АДМИНИСТРАТОРА, из папки, куда склонирован репозиторий:
#   powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\install.ps1
# Что делает: ставит (если нет) Deno и NSSM через winget, создаёт секрет MP_SECRET (или берёт прежний),
# скачивает зависимости сервера и регистрирует службу FortunaGame (автозапуск, перезапуск при падении,
# журнал C:\ProgramData\FortunaGame\logs\server.log). Сервер слушает только 127.0.0.1 — снаружи он виден
# через Cloudflare Tunnel (tunnel.ps1). Повторный запуск безопасен: служба пересоздаётся, секрет сохраняется.
param([string]$Secret = "", [int]$Port = 8787)
$ErrorActionPreference = "Continue"
$Svc = "FortunaGame"
$Data = Join-Path $env:ProgramData "FortunaGame"
$Server = (Resolve-Path (Join-Path $PSScriptRoot "..\server.js")).Path
$ServerDir = Split-Path $Server

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Запустите PowerShell от имени администратора и повторите." -ForegroundColor Red; exit 1 }

function Find-Tool($name, $wingetId) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  Write-Host "Нет $name — ставлю через winget ($wingetId)..."
  winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements | Out-Host
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $c) { Write-Host "$name не найден после установки — откройте НОВОЕ окно PowerShell (администратор) и запустите скрипт ещё раз." -ForegroundColor Red; exit 1 }
  return $c.Source
}
$DenoSrc = Find-Tool "deno" "DenoLand.Deno"
$Nssm = Find-Tool "nssm" "NSSM.NSSM"

New-Item -ItemType Directory -Force -Path $Data, "$Data\logs", "$Data\deno", "$Data\bin" | Out-Null
# своя копия deno.exe: служба (учётная запись SYSTEM) не зависит от профиля пользователя и от обновлений winget
Copy-Item $DenoSrc "$Data\bin\deno.exe" -Force
$Deno = "$Data\bin\deno.exe"
Write-Host ("Deno: " + (& $Deno --version | Select-Object -First 1))

# секрет: общий с функцией mp-ticket сайта (Supabase secrets); хранится в файле, доступном только администраторам
$SecretFile = Join-Path $Data "mp_secret.txt"
$newSecret = $false
if (-not $Secret -and (Test-Path $SecretFile)) { $Secret = (Get-Content $SecretFile -Raw).Trim() }
if (-not $Secret) {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $Secret = -join ($b | ForEach-Object { $_.ToString("x2") })
  $newSecret = $true
}
Set-Content -Path $SecretFile -Value $Secret -NoNewline -Encoding ASCII
icacls $SecretFile /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null

# зависимости (three.js из npm) — заранее, в папку службы
$env:DENO_DIR = "$Data\deno"
& $Deno cache $Server
if ($LASTEXITCODE -ne 0) { Write-Host "Не удалось скачать зависимости сервера (нужен интернет)." -ForegroundColor Red; exit 1 }

if (Get-Service $Svc -ErrorAction SilentlyContinue) {
  & $Nssm stop $Svc | Out-Null
  & $Nssm remove $Svc confirm | Out-Null
  Start-Sleep 2
}
& $Nssm install $Svc $Deno "run --allow-net --allow-read --allow-env `"$Server`"" | Out-Null
& $Nssm set $Svc AppDirectory $ServerDir | Out-Null
& $Nssm set $Svc AppEnvironmentExtra "MP_SECRET=$Secret" "PORT=$Port" "HOST=127.0.0.1" "DENO_DIR=$Data\deno" "NO_COLOR=1" | Out-Null
& $Nssm set $Svc AppStdout "$Data\logs\server.log" | Out-Null
& $Nssm set $Svc AppStderr "$Data\logs\server.log" | Out-Null
& $Nssm set $Svc AppRotateFiles 1 | Out-Null
& $Nssm set $Svc AppRotateOnline 1 | Out-Null
& $Nssm set $Svc AppRotateBytes 5000000 | Out-Null
& $Nssm set $Svc AppExit Default Restart | Out-Null
& $Nssm set $Svc AppRestartDelay 3000 | Out-Null
& $Nssm set $Svc AppStopMethodSkip 7 | Out-Null # сохранять серверу нечего — при остановке закрываем сразу (иначе Windows ждёт ~30 с)
& $Nssm set $Svc Start SERVICE_AUTO_START | Out-Null
& $Nssm set $Svc DisplayName "Fortuna Game Server (Simulator Letki online)" | Out-Null
& $Nssm start $Svc | Out-Null
Start-Sleep 5

try {
  $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 5
  Write-Host ("Сервер работает: " + ($h | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host "Сервер не ответил. Журнал: $Data\logs\server.log" -ForegroundColor Red
}
if ($newSecret) {
  Write-Host ""
  Write-Host "Создан НОВЫЙ секрет онлайна. Его нужно один раз записать в Supabase (на Маке, в папке fortuna-bot-web):" -ForegroundColor Yellow
  Write-Host "  supabase secrets set MP_SECRET=$Secret" -ForegroundColor Yellow
  Write-Host "Секрет лежит в $SecretFile (никому не пересылайте и не кладите в репозиторий)."
}
Write-Host "Дальше — туннель: powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\tunnel.ps1"
