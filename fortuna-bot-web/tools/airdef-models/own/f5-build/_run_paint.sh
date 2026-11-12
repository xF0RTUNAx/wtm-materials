#!/bin/zsh
# проба краски F-5E: данные (если $1 = bake), краска, кадры Blender, кадры игры. Аргументы: bake|-, начала имён кадров Blender, виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender
if [[ "$1" == bake ]]; then F5_TEX=${F5_TEX:-2048} "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error:|развёртка|готово" _live/gbuf.txt | cut -c1-200; fi
/usr/bin/python3 -I paint.py > _live/paint.txt 2>&1; grep -E "Traceback|Error|средний|деталь 0 " _live/paint.txt | cut -c1-200
F5_ONLY=${2:-т_} F5_SPP=${F5_SPP:-48} "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial.txt 2>&1
grep -E "Traceback|Error:|файл|точки|метки" _live/trial.txt | cut -c1-260
if [[ -f _стенд.js ]]; then deno run -A _стенд.js _проба/f5.glb --out _проба/стенд --scenes ${4:-hangar,battle} --wx day,evening --views ${3:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-200; fi
echo готово
