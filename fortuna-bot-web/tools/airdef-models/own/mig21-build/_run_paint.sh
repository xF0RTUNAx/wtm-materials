#!/bin/zsh
# проба краски: данные (если MIG21_BAKE=1), краска, файл для стенда, кадры Blender, кадры игры. Аргументы: кадры Blender (MIG21_ONLY), виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; export MIG21_TEX=${MIG21_TEX:-2048}
if [ -n "$MIG21_BAKE" ]; then MIG21_STAGE=4 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error|File \"|развёртка|готово|запечено" _live/gbuf.txt | cut -c1-200; fi
/usr/bin/python3 -I paint.py > _live/paint.txt 2>&1; grep -E "Traceback|Error|File \"|line |НЕ |НАЛОЖ|знаков|средний|сохранено" _live/paint.txt | cut -c1-200
[ -n "$MIG21_NOTRIAL" ] && exit 0
MIG21_STAGE=4 MIG21_ONLY=${1:-т_} MIG21_SPP=48 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial.txt 2>&1
grep -E "Traceback|Error:|File \"|файл|точки" _live/trial.txt | cut -c1-300
[ -n "$MIG21_NOSTAND" ] && exit 0
deno run -A _стенд.js _проба/mig21.glb --out _проба/стенд --scenes ${3:-hangar,battle} --wx day,evening --views ${2:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-170
echo готово
