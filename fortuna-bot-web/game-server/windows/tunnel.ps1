# Cloudflare Tunnel для онлайн-сервера: https://game.fortunawtm.com → http://127.0.0.1:8787 на этом ноутбуке.
# Порты на роутере не открываем, IP ноутбука никто не видит. Домен fortunawtm.com уже на Cloudflare.
# Запуск: PowerShell ОТ ИМЕНИ АДМИНИСТРАТОРА, после install.ps1:
#   powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\tunnel.ps1
# В первый раз откроется браузер — войдите в Cloudflare и выберите домен fortunawtm.com.
# Что делает: создаёт туннель fortuna-game (если его нет), DNS-запись game.fortunawtm.com и службу FortunaTunnel.
param([string]$Hostname = "game.fortunawtm.com", [int]$Port = 8787)
$ErrorActionPreference = "Continue"
$Name = "fortuna-game"
$Svc = "FortunaTunnel"
$Data = Join-Path $env:ProgramData "FortunaGame"

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
$Cf = Find-Tool "cloudflared" "Cloudflare.cloudflared"
$Nssm = Find-Tool "nssm" "NSSM.NSSM"
New-Item -ItemType Directory -Force -Path $Data, "$Data\logs" | Out-Null
$CfHome = Join-Path $env:USERPROFILE ".cloudflared"

if (-not (Test-Path "$CfHome\cert.pem")) {
  Write-Host "Сейчас откроется браузер: войдите в Cloudflare и выберите домен fortunawtm.com (Authorize)."
  & $Cf tunnel login
  if (-not (Test-Path "$CfHome\cert.pem")) { Write-Host "Вход в Cloudflare не завершён — повторите скрипт." -ForegroundColor Red; exit 1 }
}
function Get-Tunnel { (& $Cf tunnel list --output json | Out-String | ConvertFrom-Json) | Where-Object { $_.name -eq $Name } | Select-Object -First 1 }
$t = Get-Tunnel
if (-not $t) { & $Cf tunnel create $Name | Out-Host; $t = Get-Tunnel }
if (-not $t) { Write-Host "Не удалось создать туннель $Name." -ForegroundColor Red; exit 1 }
$Id = $t.id
$Cred = "$CfHome\$Id.json"
if (-not (Test-Path $Cred)) { Write-Host "Нет файла ключа туннеля $Cred (туннель создавали на другом компьютере?). Удалите туннель $Name в Cloudflare и запустите скрипт снова." -ForegroundColor Red; exit 1 }
Copy-Item $Cred "$Data\$Id.json" -Force
icacls "$Data\$Id.json" /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null

$Config = "$Data\cloudflared.yml"
@"
tunnel: $Id
credentials-file: $Data\$Id.json
ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:$Port
  - service: http_status:404
"@ | Set-Content -Path $Config -Encoding ASCII

Write-Host "DNS: $Hostname → туннель $Name"
& $Cf tunnel route dns $Name $Hostname | Out-Host

if (Get-Service $Svc -ErrorAction SilentlyContinue) {
  & $Nssm stop $Svc | Out-Null
  & $Nssm remove $Svc confirm | Out-Null
  Start-Sleep 2
}
& $Nssm install $Svc $Cf "tunnel --no-autoupdate --config `"$Config`" run $Name" | Out-Null
& $Nssm set $Svc AppStdout "$Data\logs\tunnel.log" | Out-Null
& $Nssm set $Svc AppStderr "$Data\logs\tunnel.log" | Out-Null
& $Nssm set $Svc AppRotateFiles 1 | Out-Null
& $Nssm set $Svc AppRotateOnline 1 | Out-Null
& $Nssm set $Svc AppRotateBytes 5000000 | Out-Null
& $Nssm set $Svc AppExit Default Restart | Out-Null
& $Nssm set $Svc AppRestartDelay 5000 | Out-Null
& $Nssm set $Svc Start SERVICE_AUTO_START | Out-Null
& $Nssm set $Svc DisplayName "Fortuna Game Tunnel (Cloudflare)" | Out-Null
& $Nssm start $Svc | Out-Null

Write-Host "Жду, пока туннель поднимется..."
$ok = $false
for ($i = 0; $i -lt 12 -and -not $ok; $i++) {
  Start-Sleep 5
  try { $h = Invoke-RestMethod "https://$Hostname/health" -TimeoutSec 5; $ok = $true } catch { }
}
if ($ok) { Write-Host ("Готово: https://$Hostname/health → " + ($h | ConvertTo-Json -Compress)) -ForegroundColor Green }
else { Write-Host "Пока не отвечает (DNS может обновляться до нескольких минут). Проверьте позже https://$Hostname/health; журнал: $Data\logs\tunnel.log" -ForegroundColor Yellow }
