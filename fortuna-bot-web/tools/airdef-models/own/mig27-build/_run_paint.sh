#!/bin/zsh
# проба краски МиГ-23БН: данные (если $1 = bake), краска схемы $2 (su|gdr|worn), кадры Blender ($3 - начала имён), стенд игры ($4 - виды боя, $5 - сцены; - пропустить).
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; export MG_TEX=${MG_TEX:-2048}; export MG_SWEEP=${MG_SWEEP:-0};   # файл игры с разложенными консолями (Mark 2026-11-13)
 SC=${2:-su}
if [[ "$1" == bake ]]; then MG_STAGE=4 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf.txt 2>&1; grep -E "Traceback|Error:|развёртка|готово" _live/gbuf.txt | cut -c1-200; fi
MG_SCHEME=$SC /usr/bin/python3 -I paint.py > _live/paint_$SC.txt 2>&1; grep -E "Traceback|Error|НАЛОЖ|НЕ ЛЁГ|средний|знаков" _live/paint_$SC.txt | cut -c1-220
MG_MAPS=_проба/$SC MG_ONLY=${3:-т_} MG_SPP=${MG_SPP:-48} MG_STAGE=4 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial_$SC.txt 2>&1
grep -E "Traceback|Error:|файл|точки|метки" _live/trial_$SC.txt | cut -c1-300
[[ "$4" == "-" ]] && { echo готово; exit 0; }
deno run -A _стенд.js _проба/$SC/mig23.glb --out _проба/$SC/стенд --scenes ${5:-hangar,battle} --wx day,evening --views ${4:-orbit,side,below,rear} 2>&1 | tail -24 | cut -c1-200
echo готово
