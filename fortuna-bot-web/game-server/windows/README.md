# Онлайн-сервер «Симулятора Летки» на Windows-ноутбуке

Сервер — одна программа на Deno (`fortuna-bot-web/game-server/server.js`), работает службой Windows рядом с ботом.
Снаружи он доступен как `wss://game.fortunawtm.com/ws` через Cloudflare Tunnel: порты на роутере не открываем, IP ноутбука никто не видит.
Игра на сайте сама подключается к этому адресу.

Всё ниже — один раз. Потом ноутбук сам запускает сервер и туннель после перезагрузки.

## 0. Что нужно

- Windows 10/11 с `winget` (есть по умолчанию; если нет — «Установщик приложений» из Microsoft Store).
- Git (`winget install Git.Git`), если его ещё нет.
- Всё остальное (Deno, NSSM, cloudflared) скрипты поставят сами через `winget`.

## 1. Код сервера

PowerShell **от имени администратора**:

```powershell
cd C:\
git clone --filter=blob:none --no-checkout https://github.com/xF0RTUNAx/wtm-materials.git fortuna
cd C:\fortuna
git sparse-checkout set --cone fortuna-bot-web/game-server fortuna-bot-web/games/drone
git checkout main
```

Скачиваются только сервер и логика игры (без картинок сайта). Папка — `C:\fortuna`.

Если ноутбук когда-то переключали на `online-dev` — вернуться на `main` так (сначала свежий код, потом переключение — иначе git попробует удалить папку работающего сервера):

```powershell
git fetch origin
git checkout -B main origin/main
```

## 2. Служба сервера

```powershell
cd C:\fortuna
powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\install.ps1
```

Скрипт:
- ставит Deno и NSSM, если их нет;
- создаёт **секрет онлайна** `MP_SECRET` и сохраняет его в `C:\ProgramData\FortunaGame\mp_secret.txt` (только для администраторов);
- регистрирует службу **FortunaGame**: автозапуск, перезапуск при падении, журнал `C:\ProgramData\FortunaGame\logs\server.log`;
- проверяет `http://127.0.0.1:8787/health`.

В конце он напечатает строку `supabase secrets set MP_SECRET=...` — это для шага 3.

## 3. Секрет и функция билетов в Supabase (на Маке)

Игра получает у сайта подписанный «билет» (функция `mp-ticket`), сервер проверяет подпись тем же секретом.
На Маке, в папке `fortuna-bot-web`:

```bash
supabase secrets set MP_SECRET=<секрет из шага 2>
supabase functions deploy mp-ticket --no-verify-jwt
```

Секрет никуда больше не пересылать и в репозиторий не класть (репозиторий публикуется на сайте).

## 4. Туннель Cloudflare

```powershell
cd C:\fortuna
powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\tunnel.ps1
```

В первый раз откроется браузер — войдите в Cloudflare и выберите домен **fortunawtm.com** (Authorize).
Скрипт создаст туннель `fortuna-game`, запись DNS `game.fortunawtm.com` и службу **FortunaTunnel**, затем проверит
`https://game.fortunawtm.com/health`. DNS иногда обновляется несколько минут.

## 5. Проверка

- В браузере: `https://game.fortunawtm.com/health` → `{"ok":true,"online":0,"rooms":0,...}`.
- На сайте: вкладка «Игра» → «Симулятор Летки» → «Онлайн-бой». Под карточкой появится строка «Онлайн: в игре N · ищут бой…».

## Обновление кода

```powershell
cd C:\fortuna
powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\update.ps1
```

`git pull` и перезапуск службы. Если кто-то играет — скрипт спросит (перезапуск обрывает бои; `-Force` — не спрашивать).

## Управление и журналы

| Что | Команда |
|---|---|
| Состояние служб | `Get-Service FortunaGame, FortunaTunnel` |
| Перезапустить туннель | `Restart-Service FortunaTunnel` |
| Перезапустить сервер | `Restart-Service FortunaGame` |
| Остановить / запустить | `Stop-Service FortunaGame` / `Start-Service FortunaGame` |
| Журнал сервера | `Get-Content C:\ProgramData\FortunaGame\logs\server.log -Tail 50 -Wait` |
| Журнал туннеля | `Get-Content C:\ProgramData\FortunaGame\logs\tunnel.log -Tail 50` |
| Кто сейчас играет | `https://game.fortunawtm.com/health` |
| **Журнал боёв** (для разбора, что пошло не так) | `powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\logs.ps1` — кладёт журнал за сегодня на рабочий стол (`-Date 2026-10-01` — за другой день); файл прислать Claude |

Журнал боёв — `C:\fortuna\fortuna-bot-web\game-server\logs\ГГГГ-ММ-ДД.jsonl`, 14 дней: входы, старт/итог, пуски и отказы с причиной, чем кончилась каждая ракета, сбития, обрывы связи, подхват ИИ, ошибки, снимок раз в 5 с и записи игры (её отказы пуска, ошибки страницы, кадры/устройство). Серверу для него нужна запись — `update.ps1` сам выставляет службе `--allow-write`. Чтение по сети (по желанию): переменная службы `LOG_KEY` → `https://game.fortunawtm.com/logs?key=…&date=ГГГГ-ММ-ДД`. Разбор: `deno run --allow-read game-server/log-view.js файл.jsonl [КОД] [--state]`.

## Если что-то не так

- **`/health` локально не отвечает** — смотреть `server.log`. Частое: нет интернета при первом запуске (Deno качает `three` из npm) — `install.ps1` ещё раз.
- **Локально отвечает, `game.fortunawtm.com` — нет** — `tunnel.log`; `Get-Service FortunaTunnel`; подождать DNS 5 минут.
- **В игре «Не удалось подтвердить аккаунт»** — секрет на ноутбуке и в Supabase разный или не развёрнута `mp-ticket`: повторить шаг 3 с секретом из `C:\ProgramData\FortunaGame\mp_secret.txt`, затем `Restart-Service FortunaGame`.
- **Служба зависла в состоянии `StopPending`** (`Get-Service FortunaGame` → `StopP…`, сервер не отвечает): закрыть её обёртку и запустить заново —
  `$p = (Get-CimInstance Win32_Service -Filter "Name='FortunaGame'").ProcessId; Stop-Process -Id $p -Force; Start-Service FortunaGame`.
- **Журнал читается «кракозябрами»** — добавить `-Encoding UTF8` к `Get-Content`.
- **Сменить секрет**: `install.ps1 -Secret <новый>`, затем шаг 3 с ним.
- Ноутбук должен не засыпать (как для бота): «Электропитание» → сон — «Никогда» при питании от сети.
