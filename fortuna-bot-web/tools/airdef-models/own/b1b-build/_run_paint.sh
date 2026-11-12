#!/bin/zsh
# проба краски B-1B: данные (если $1 = bake), краска, кадры Blender, кадры игры. Аргументы: bake|-, начала имён кадров Blender, виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender
if [[ "$1" == bake ]]; then B1_STAGE=4 B1_TEX=${B1_TEX:-2048} "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error:|развёртка|готово" _live/gbuf.txt | cut -c1-200; fi
B1_PREV=1 /usr/bin/python3 -I paint.py > _live/paint.txt 2>&1; grep -E "Traceback|Error|НАЛОЖ|не лёг|средний|знаков" _live/paint.txt | cut -c1-200
B1_STAGE=4 B1_ONLY=${2:-т_} B1_SPP=${B1_SPP:-48} "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial.txt 2>&1
grep -E "Traceback|Error:|файл|точки|метки" _live/trial.txt | cut -c1-260
deno run -A _стенд.js _проба/b1b.glb --out _проба/стенд --scenes ${4:-hangar,battle} --wx day,evening --views ${3:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-200
echo готово
