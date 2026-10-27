# Симулятор iPhone: вылеты Safari, панели, память (2026-10-27)

Поиск вылета «игра порой вылетает» и проверка полного экрана на iPhone — см. память `airdef-safari-crash-hunt` и AIRDEF_STATE.md (2026-10-27).
Нужен Xcode с симулятором (iPhone 17, iOS 26.5; UDID в скриптах — `63CB386F-…`, поменять под свой: `xcrun simctl list devices`)
и сервер игры `python3 fortuna-bot-web/tools/dev/nocache-server.py 8937` (из корня wtm-materials). Симулятор ходит на localhost Мака.

- `logsrv.py <файл>` — приёмник строк с телефона на :8939 (страницы `tools/airdef-ui/gl-log.html`, `astc-crash.html` шлют сюда журнал):
  `python3 logsrv.py ${TMPDIR:-/tmp}/airdef-gl.log`.
- `simshot.sh <путь-без-.png>` — снимок экрана симулятора, повёрнутый в горизонталь.
- `crashrun.sh <адрес> <секунд>` — открыть страницу в Safari симулятора и посчитать падения графического процесса (отчёты в
  ~/Library/Logs/DiagnosticReports пишутся с задержкой до пары минут) и перезагрузки страницы.
- `ab.sh <доп. параметры игры> <прогонов>` — частота вылетов на gl-log.html?nowrap=1 (без перехвата GL), 60 с на прогон.
- `memwatch.sh <секунд>` — память процессов WebContent и GPU симулятора раз в 2 с (footprint).

Страницы в `tools/airdef-ui/`: `frame-test.html` — копия рамки сайта (app.html «Аркада»; `?fix=1` — как после правки viewport-fit,
`?strip=1` — старые проверочные полоса и кнопка, `?x=` — параметры игры), `gl-log.html` — игра во фрейме с журналом
compressedTexImage2D (`?quiet=1`, `?nowrap=1`, `?auto=1` — «пилот»: высоты, пуски, ловушки; `?fix=keep|copy`),
`astc-crash.html` — синтетические загрузки сжатых текстур (`?m=img|sub|tile`, `?s=npot`, `?f=etc2`, `?draw=1`, `?keep=1`, `?ps=1`).
Итог 2026-10-27: синтетика не падает; падения графического процесса в compressedTexImage2D — на загрузке боя, нерегулярно;
мост Metal симулятора (SimMetalHost) сам нестабилен — на телефоне не подтверждено.

Рядом, в `tools/airdef-perf/`: `crash-flow.js` (бой → сбой вкладки → окно отчёта → «Отправить», нужен сервер игры на :8787),
`heap-growth.js` (куча JS после сборки мусора в бою с «пилотом»), `hud-shot.js` (снимок интерфейса на телефоне, `CHIP=1` — значок
пинга), `end-shots.js` (экраны итога `?endmock=`).
