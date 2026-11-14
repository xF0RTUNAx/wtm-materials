#!/bin/zsh
# финал МиГ-25БМ (Mark 2026-11-14: «убери черную полоску из белого тоже и внедрим его в игру»): данные 4096, краска silver в папку модели, серая и камуфляж в окраски/,
# стыки, касания, сдача deliver.py, стенд игры.
cd "${0:a:h}"; BL=/Applications/Blender.app/Contents/MacOS/Blender; export MG_TEX=4096
MG_STAGE=4 "$BL" -b --factory-startup --python build.py --python gbuf.py > _live/gbuf_final.txt 2>&1; grep -E "Traceback|Error:|атласа|плотность|готово" _live/gbuf_final.txt | cut -c1-160
MG_SCHEME=silver MG_OUT=$PWD /usr/bin/python3 -I paint.py > _live/paint_final.txt 2>&1; grep -E "Traceback|Error|НАЛОЖ|НЕ ЛЁГ|средний|знаков|центр площади" _live/paint_final.txt | cut -c1-200
mkdir -p окраски/серая окраски/камуфляж
MG_SCHEME=grey MG_OUT=$PWD/окраски/серая /usr/bin/python3 -I paint.py > _live/paint_final_grey.txt 2>&1 &
MG_SCHEME=camo MG_OUT=$PWD/окраски/камуфляж /usr/bin/python3 -I paint.py > _live/paint_final_camo.txt 2>&1 &
STYK_SCENE=MG STYK_SKIN=MG_skin STYK_OUT=_стыки MG_STAGE=4 "$BL" -b --factory-startup --python build.py --python ../_самолёты/проверка_стыков.py > _live/styk_final.txt 2>&1; grep -E "ИТОГ" _live/styk_final.txt
MG_OUT_J=_live/collide.json MG_STAGE=4 "$BL" -b --factory-startup --python build.py --python _collide.py > _live/col.txt 2>&1; grep -E "касаний': [1-9]|^_Х" _live/col.txt | grep -v размах | cut -c1-200
MG_STAGE=4 MG_SPP=96 "$BL" -b --factory-startup --python build.py --python deliver.py > _live/deliver.txt 2>&1; grep -E "Traceback|Error:|превью|игра|шасси|паспорт|Sketchfab|клип|blend|сдача" -A2 _live/deliver.txt | cut -c1-240
wait; for f in grey camo; do grep -E "Traceback|Error|средний" _live/paint_final_$f.txt | cut -c1-160; done
mkdir -p _live/sf; cp mig25.glb mig25_gear.glb точки.json _live/sf/
deno run -A _стенд.js _live/sf/mig25.glb --out превью-игра --scenes hangar,battle --wx day,evening --views orbit,side,below,rear 2>&1 | grep -E "ангар|бой|не изменён|шасси не|в файле игры|подвеска" | cut -c1-200
echo ВСЁ
