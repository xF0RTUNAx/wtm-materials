#!/bin/zsh
# проба краски: данные (если SU17_BAKE=1), краска, файл для стенда, кадры Blender, кадры игры. Аргументы: кадры Blender (SU17_ONLY), виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; export SU17_TEX=${SU17_TEX:-2048}
if [ -n "$SU17_BAKE" ]; then SU17_STAGE=4 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error|File \"|развёртка|готово|запечено" _live/gbuf.txt | cut -c1-200; fi
/usr/bin/python3 -I paint.py > _live/paint.txt 2>&1; grep -E "Traceback|Error|File \"|line |НЕ |НАЛОЖ|знаков|средний|сохранено" _live/paint.txt | cut -c1-200
[ -n "$SU17_NOTRIAL" ] && exit 0
SU17_STAGE=4 SU17_ONLY=${1:-т_} SU17_SPP=48 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial.txt 2>&1
grep -E "Traceback|Error:|File \"|файл|точки" _live/trial.txt | cut -c1-300
[ -n "$SU17_NOSTAND" ] && exit 0
deno run -A _стенд.js _проба/su17.glb --out _проба/стенд --scenes ${3:-hangar,battle} --wx day,evening --views ${2:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-170
echo готово
