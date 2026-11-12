#!/bin/zsh
# проба краски: данные (если F111_BAKE=1), краска, файл для стенда, кадры Blender, кадры игры. Аргументы: кадры Blender (F111_ONLY), виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; export F111_TEX=${F111_TEX:-2048}
if [ -n "$F111_BAKE" ]; then F111_STAGE=4 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error|File \"|развёртка|готово|запечено" _live/gbuf.txt | cut -c1-200; fi
/usr/bin/python3 -I paint.py > _live/paint.txt 2>&1; grep -E "Traceback|Error|File \"|line |НЕ |НАЛОЖ|знаков|средний|сохранено" _live/paint.txt | cut -c1-200
[ -n "$F111_NOTRIAL" ] && exit 0
F111_STAGE=4 F111_ONLY=${1:-т_} F111_SPP=48 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial.txt 2>&1
grep -E "Traceback|Error:|File \"|файл|точки" _live/trial.txt | cut -c1-300
[ -n "$F111_NOSTAND" ] && exit 0
deno run -A _стенд.js _проба/f111.glb --out _проба/стенд --scenes ${3:-hangar,battle} --wx day,evening --views ${2:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-170
echo готово
