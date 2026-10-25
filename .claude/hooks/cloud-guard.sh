#!/bin/bash
# Защита облачной сессии (claude.ai/code) для «Воздушного превосходства» — Mark 2026-10-25: «облачная сессия ничего не должна сломать,
# главная сессия потом всё подтянет». На Маке Mark (есть /Users/mark.) — ничего не делает. В облаке:
#   PreToolUse (Bash, Edit, Write, MultiEdit, NotebookEdit) — запрещает пуш куда-либо, кроме своей ветки cloud/…, force/delete-пуш,
#     слияние PR, Supabase CLI, пересборку моделей и правку файлов, которые ведёт главная сессия (журнал, титры, модели, эта защита);
#   SessionStart (аргумент start) — напоминание, с чего начать (раздел «Для облачной сессии» в fortuna-bot-web/AIRDEF_STATE.md).
# Только bash и grep: в облаке может не быть jq и python. Проверка на Маке: CLOUD_GUARD_TEST=1 — как в облаке.
[ -d "/Users/mark." ] && [ -z "$CLOUD_GUARD_TEST" ] && exit 0

if [ "$1" = "start" ]; then
  cat <<'EOF'
ОБЛАЧНАЯ СЕССИЯ (временная). Прежде чем что-то делать: git fetch origin; ветка от online-dev — git checkout -b cloud/<тема> origin/online-dev;
прочитать fortuna-bot-web/AIRDEF_STATE.md — разделы «Для облачной сессии», «Правила», «Текущее состояние». Пушить только свою ветку:
git push -u origin cloud/<тема>. main, online-dev, Supabase, модели, AIRDEF_STATE.md — нельзя (защита .claude/hooks/cloud-guard.sh).
Свои заметки и итог — в fortuna-bot-web/CLOUD_NOTES.md; главная сессия на Маке потом проверит и вольёт ветку.
EOF
  exit 0
fi

IN=$(cat)
deny() { echo "cloud-guard: $1. Облачная сессия работает только в своей ветке cloud/<тема> (см. «Для облачной сессии» в fortuna-bot-web/AIRDEF_STATE.md); это делает главная сессия на Маке." >&2; exit 2; }
tool=$(printf '%s' "$IN" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$IN" | grep -o '"command"[[:space:]]*:[[:space:]]*"\([^"\\]\|\\.\)*"' | head -1)
  if printf '%s' "$cmd" | grep -Eq 'git[^;&|]*[[:space:]]push'; then
    printf '%s' "$cmd" | grep -Eq -- '--force|--force-with-lease|[[:space:]]-f([[:space:]]|$|")|--delete|[[:space:]]-d[[:space:]]|[[:space:]]:[A-Za-z]|--mirror|--all|--tags' && deny "force/delete/массовый пуш запрещён"
    printf '%s' "$cmd" | grep -Eq '(^|[^A-Za-z0-9_/-])(main|online-dev)([^A-Za-z0-9_-]|$)' && deny "пуш в main или online-dev запрещён"
    printf '%s' "$cmd" | grep -q 'cloud/' || deny "пушить можно только ветку с явным именем cloud/<тема> (git push -u origin cloud/<тема>)"
  fi
  printf '%s' "$cmd" | grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge|gh[[:space:]]+api[^"]*merges' && deny "слияние в чужие ветки запрещено"
  printf '%s' "$cmd" | grep -Eq '(^|[^A-Za-z0-9_-])supabase([[:space:]]|$|")' && deny "Supabase CLI запрещён (вход в базу — только с Мака)"
  printf '%s' "$cmd" | grep -Eq 'prepare\.js|ktx-models\.js|thumbs-bake\.js|integrate-own\.js|land_models|assets-manifest\.js' && deny "модели, текстуры, иконки и манифест пересобирает главная сессия"
  printf '%s' "$cmd" | grep -Eq '\.claude/(hooks|settings)' && printf '%s' "$cmd" | grep -Eq 'sed[[:space:]]+-i|>|rm[[:space:]]|mv[[:space:]]|cp[[:space:]]|tee|truncate|chmod|python|node|deno|perl' && deny "защиту облачной сессии менять нельзя"
  exit 0
fi

case "$tool" in Edit|Write|MultiEdit|NotebookEdit) ;; *) exit 0 ;; esac
path=$(printf '%s' "$IN" | grep -o '"\(file_path\|notebook_path\)"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
case "$path" in
  *ECONOMY_CATALOG.md|*fortuna-bot-web/CLAUDE.md|*AIRDEF_STATE.md) deny "файл ведёт главная сессия (заметки — в fortuna-bot-web/CLOUD_NOTES.md)" ;;
  *games/airdef/models/credits.js|*games/airdef/models/CREDITS.md|*games/airdef/models/ktx/index.json|*games/airdef/assets.json) deny "генерируемый файл — пересобирает главная сессия" ;;
  *.glb|*.ktx2|*.blend) deny "модели и текстуры — только на Маке" ;;
  *.claude/hooks/*|*.claude/settings.json|*.claude/settings.local.json|*.claude/skills/deploy-airdef/*) deny "защиту и навык деплоя менять нельзя" ;;
esac
exit 0
