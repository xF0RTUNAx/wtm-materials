#!/bin/zsh
# чистовая сдача Су-25 (после «запекай»): ход, стыки, данные 4096, краска 4096 в папку модели, deliver.py, стенд игры на чистовом файле, пакет Sketchfab
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender
S25_STAGE=4 S25_OUT_J=_снимки/collide.json "$BL" -b --factory-startup --python build.py --python _collide.py > _live/f_collide.txt 2>&1; grep -E "ХОД" _live/f_collide.txt | grep -v " 0 мм" | cut -c1-160; echo "ход проверен"
S25_STAGE=4 STYK_OUT=_стыки "$BL" -b --factory-startup --python build.py --python ../_самолёты/проверка_стыков.py > _live/f_styk.txt 2>&1; grep -E "ИТОГ" _live/f_styk.txt
S25_STAGE=4 S25_TEX=4096 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/f_gbuf.txt 2>&1; grep -E "Traceback|Error:|развёртка|готово" _live/f_gbuf.txt | cut -c1-200
S25_TEX=4096 S25_SCHEME=pixel S25_CHIP=old S25_OUT=. /usr/bin/python3 -I paint_su.py > _live/f_paint.txt 2>&1; grep -E "Traceback|Error|средний|сохранено" _live/f_paint.txt | cut -c1-200
S25_STAGE=4 S25_TEX=4096 "$BL" -b --factory-startup --python build.py --python deliver.py > _live/f_deliver.txt 2>&1; grep -E "Traceback|Error:|ОСНАСТКА|превью|Sketchfab|файл|сдача" _live/f_deliver.txt | cut -c1-400
deno run -A _стенд.js su25.glb --out _проба/стенд_чистовой --scenes hangar,battle --wx day,evening --views orbit,side,rear,below 2>&1 | grep -E "ангар|бой|шасси|META" | cut -c1-260
(cd /Users/mark./wtm-materials/fortuna-bot-web && deno run -A tools/airdef-models/sketchfab-pack.js "${0:a:h}" 2>&1 | tail -8)
echo ГОТОВО
