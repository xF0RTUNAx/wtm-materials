#!/bin/zsh
# проба краски: окраски (2048) -> кадры Blender -> стенд игры. Аргументы: схемы (по умолчанию все).
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; SCH=(${=${1:-grey blue dark}})
for sc in $SCH; do (YK_TEX=2048 YK_SCHEME=$sc YK_PREV=1 /usr/bin/python3 -I paint.py > _live/paint_$sc.txt 2>&1; grep -E "Traceback|Error|не лёг|средний" _live/paint_$sc.txt | cut -c1-160 | sed "s/^/$sc: /") & done; wait
for sc in $SCH; do
  YK_STAGE=4 YK_MAPS=_проба/$sc YK_SPP=40 "$BL" -b --factory-startup --python build.py --python _trial.py > _live/trial_$sc.txt 2>&1
  grep -E "Traceback|Error:|File \"|^файл|точки" _live/trial_$sc.txt | cut -c1-300 | sed "s/^/$sc: /"
done
for sc in $SCH; do
  deno run -A _стенд.js _проба/$sc/yak38.glb --out _проба/$sc/стенд --scenes hangar,battle --wx day --views orbit,side,below 2>&1 | tail -6 | cut -c1-200 | sed "s/^/$sc: /"
done
echo ГОТОВО
