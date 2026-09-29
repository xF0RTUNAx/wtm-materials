#!/bin/sh
# Прогон «Симулятора Летки» без браузера (JavaScriptCore из macOS + настоящий three.js r128 + заглушки DOM/WebGL).
# Ловит ошибки выполнения (порядок инициализации, опечатки, логику цикла); шейдеры НЕ компилирует и картинку не проверяет.
# Использование: tools/drone-headless/run.sh [пресет: low|medium|high|ultra|cinema] [режим: arcade|real|training] [погода: day|morning|evening|sunset|overcast|rain]
set -e
cd "$(dirname "$0")"
[ -f three.min.js ] || curl -sS -o three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
MAIN="$(cd ../../games/drone && pwd)/main.js"
cat > .run_args.js <<EOF2
globalThis.THREE_PATH = 'three.min.js'; globalThis.MAIN_PATH = '$MAIN'; globalThis.GFX_ARG = '${1:-medium}'; globalThis.MODE_ARG = '${2:-arcade}'; globalThis.WEATHER_ARG = '${3:-}';
load('run.js');
EOF2
perl -e 'alarm 90; exec @ARGV' /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc .run_args.js
