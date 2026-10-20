---
name: deploy-airdef
description: Деплой «Воздушного превосходства» (fortuna-bot-web) на fortunawtm.com по слову Mark «деплой» — тесты, версия модулей, функции Supabase, коммит, пуш в online-dev и main, проверка сайта, напоминание про сервер на ноутбуке. Только по явному «деплой».
---
# Деплой «Воздушного превосходства»

Запускать **только** когда Mark написал «деплой». Репозиторий wtm-materials (на Mac — `/Users/mark./wtm-materials`, в облаке — корень `git rev-parse --show-toplevel`), ветка `online-dev`. Отвечать по-русски.

## 1. Что выкладываем
- `git status --short` и `git log --oneline origin/main..online-dev`.
- Прочитать `fortuna-bot-web/AIRDEF_STATE.md`: правила, текущая версия модулей, что задеплоено.
- Никогда не добавлять: `fortuna-bot-web/ECONOMY_CATALOG.md`, `fortuna-bot-web/CLAUDE.md`, `fortuna-bot-web/tools/airdef-fx/sheets/`.
  Незнакомые несохранённые файлы — спросить Mark.

## 2. Проверки (до любых изменений на боевом)
В `fortuna-bot-web`: `ui-test.js` (итог «ошибок нет»; «пауза» / «съёмка волны» — повторить раз), `sim-test.js`, `progress-stand.js`,
`progress-server-test.js`; в `game-server`: `airdef-smoke.js`, `airdef-full.js`, `airdef-multi-test.js`; если трогали `games/drone/` —
`tools/drone-headless/regress.sh`. Можно поручить помощнику `airdef-tester`. Упало — не деплоить, сообщить Mark.
Перед крупным деплоем — ревью помощником `airdef-reviewer` (или `/code-review`).

## 3. Версия модулей
Если менялись модули `games/airdef/*.js` с прошлого деплоя и версия ещё та, что на сайте (`curl -s https://fortunawtm.com/fortuna-bot-web/games/airdef.html | grep -o "main.js?v=[0-9a-z]*"`):
поднять последнюю букву `?v=2026MMDDx` во всех файлах:
`grep -rl "?v=СТАРАЯ" games game-server tools | xargs sed -i '' 's/?v=СТАРАЯ/?v=НОВАЯ/g'` (в `fortuna-bot-web`), проверить, что старой не осталось.
Версии файлов моделей (`GLB_V` в models.js) — отдельные, их меняют только при пересборке модели.

## 4. Supabase (только если менялись `supabase/` или `progress.js` / `arsenal.js` / `sim/flight.js`)
- `deno run -A tools/airdef-headless/sync-shared.js`, затем `progress-server-test.js`.
- Новые `sql/0NN_*.sql`: `SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/0NN_….sql`.
- Функции: `SUPABASE_ACCESS_TOKEN= supabase functions deploy <имя> --no-verify-jwt --project-ref bhcvxunvbxodkpcrjwbq`
  (обычно airdef-progress, airdef-solo, airdef-claim, mp-ticket — те, что импортируют `_shared`).
- 401 — Mark должен выполнить `supabase login` сам; токен в чате не просить.
- Проверка без изменения данных: запрос от несуществующего игрока `00000000-0000-0000-0000-000000000000` → 404.

## 5. Коммит и пуш
- `git add` только конкретных путей (`fortuna-bot-web/games/airdef.html fortuna-bot-web/games/airdef fortuna-bot-web/game-server/…`
  и т. д.), проверить `git diff --cached --name-only` на запретные файлы.
- Коммит по-русски (что изменилось для игрока), последней строкой — `Co-Authored-By:` как задаёт Claude Code в этой сессии.
- `git push origin online-dev` и `git push origin online-dev:main`.

## 6. Проверка сайта
Каждые 30 с (до ~5 мин) проверять, что `https://fortunawtm.com/fortuna-bot-web/games/airdef.html` отдаёт новую версию модулей;
затем `curl -o /dev/null -w "%{http_code}"` по 3–5 изменённым файлам (код 200).

## 7. Итог для Mark
- Что выложено (коротко, для игрока), коммит, версия.
- Ссылка: https://fortunawtm.com/fortuna-bot-web/games/airdef.html (в Telegram — закрыть и открыть мини-приложение).
- Если менялись `game-server/` или `games/airdef/arsenal.js`, `progress.js`, `launchers.js`, `sim/*` — Mark запускает на ноутбуке:
  `cd C:\fortuna` и `powershell -ExecutionPolicy Bypass -File fortuna-bot-web\game-server\windows\update.ps1`.
- Дописать строку в журнал `AIRDEF_STATE.md` и обновить «Текущее состояние» (это попадёт в следующий коммит — или
  закоммитить сразу отдельным коммитом в online-dev, без пуша в main).
