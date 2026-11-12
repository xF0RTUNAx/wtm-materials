#!/bin/zsh
# проба краски B-52H: данные (если $1 = bake), краска, кадры Blender, кадры игры. Аргументы: bake|-, начала имён кадров Blender, виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender
if [[ "$1" == bake ]]; then B52_TEX=${B52_TEX:-2048} B52_STAGE=4 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error:|развёртка|готово" _live/gbuf.txt | cut -c1-200; fi
B52_PREV=1 /usr/bin/python3 -I paint.py > _live/paint.txt 2>&1; grep -E "Traceback|Error|НАЛОЖ|не лёг|средний|доля" _live/paint.txt | cut -c1-200
B52_ONLY=${2:-т_} B52_SPP=${B52_SPP:-48} B52_STAGE=4 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial.txt 2>&1
grep -E "Traceback|Error:|файл|точки|метки" _live/trial.txt | cut -c1-260
deno run -A _стенд.js _проба/b52.glb --out _проба/стенд --scenes ${4:-hangar,battle} --wx day,evening --views ${3:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-200
echo готово
