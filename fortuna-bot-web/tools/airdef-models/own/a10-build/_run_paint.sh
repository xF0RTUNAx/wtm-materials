#!/bin/zsh
# проба краски: файл для стенда, кадры Blender, кадры игры. Аргументы: схема (grey|green), кадры Blender (A10_ONLY), виды боя, сцены.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; SC=${1:-grey}
A10_STAGE=4 A10_SCHEME=$SC A10_ONLY=${2:-т_} A10_SPP=48 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial_$SC.txt 2>&1
grep -E "Traceback|Error:|File \"|файл|точки" _live/trial_$SC.txt | cut -c1-260
if [[ "${4:-hangar,battle}" == *hangar* ]]; then deno run -A _стенд.js _проба/$SC/ангар/a10.glb --out _проба/$SC/стенд --scenes hangar --wx day 2>&1 | tail -6 | cut -c1-200; fi
if [[ "${4:-hangar,battle}" == *battle* ]]; then deno run -A _стенд.js _проба/$SC/a10.glb --out _проба/$SC/стенд --scenes battle --wx day,evening --views ${3:-orbit,side,front,rear} 2>&1 | tail -14 | cut -c1-200; fi
echo готово $SC
