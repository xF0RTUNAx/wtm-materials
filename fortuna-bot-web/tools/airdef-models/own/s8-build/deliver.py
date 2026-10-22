# С-8КОМ (ревизия 2: текстура и нормали) — проверка и сдача: статистика, превью, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   S8_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b "<папка модели>/_rev1/s8.blend" --factory-startup \
#       --python build.py --python bake.py --python deliver.py
# Чертежей-кадров для силуэтов в папке нет (ревизия 1 собрана по чертежу и фото из интернета ранее) — форма не менялась, проверка силуэта не повторяется.
# S8_REUSE=1 — цвет не запекать заново (геометрия та же — развёртка та же), пересчитать только нормали и сдачу.
import os, sys, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и собрал сцену S8

OUT = os.environ.get('S8_OUT')
if not OUT: raise SystemExit('Задай S8_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
sc = bpy.data.scenes['S8']
st = mk.stats()

# превью для Sketchfab и для Mark (общий, сбоку, хвост, голова) — уже с текстурой и нормалями
prev = [os.path.basename(p) for p in mk.previews(OUT)]

# сдача: файл для Sketchfab — с полными текстурами (1024); игровой файл и .blend — с облегчёнными (256: цвет JPEG, нормали PNG)
mk.export(OUT + '/s8_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + '/s8_detail_256.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + '/s8_normal_256.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('S8_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'S8_normal' else lc
mk.export(OUT + '/s8.glb', OUT + '/s8.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_nar_s8', weapon='s8', name='С-8КОМ', name_en='S-8', glb='s8.glb', blend='s8.blend', rev=2,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'S-8KOM 80 mm Rocket — Low Poly, Textured',
               'lead': 'S-8KOM — Soviet/Russian 80 mm unguided air-to-ground rocket (HEAT-fragmentation warhead) with six fold-out stabilizer blades shown deployed. Hand-modelled low-poly exterior with baked paint wear, exhaust soot and a normal map.',
               'parts': ['fuze', 'nose cone', 'warhead with grooved fragmentation sleeve', 'motor', 'tail ring', 'nozzle hub', '6 canted blades with hinge lugs'],
               'tags': ['s-8', 's8', 'rocket', '80mm', 'missile', 'military', 'weapon', 'helicopter', 'lowpoly', 'game-ready', 'textured', 'blender', 'soviet'],
               'dimensions': 'length 1.57 m, body diameter 80 mm, fragmentation sleeve 82 mm, blade span 384 mm',
               'textures': '1024 px baked colour map and tangent-space normal map',
               'glb': 's8_sketchfab.glb'},
    notes='Ревизия 2 (2026-10-22, текстуры по образцу Х-29Т): форма ревизии 1 без изменений; добавлены текстура цвета (затенение стыков и канавок, потёки вдоль корпуса, нагар у сопла, потёртости на кромках) и карта нормалей (скруглённые кромки, зерно краски). '
          'Надписей и маркировки нет — на картинках-источниках их не видно. Для игры — 256 (s8.glb), для Sketchfab — 1024 (s8_sketchfab.glb). Нос в −Z осей glTF.')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = 256; pj['nTex'] = 256
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
