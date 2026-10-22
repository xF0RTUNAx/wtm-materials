# Hydra 70 (ревизия 2: текстура и нормали) — проверка и сдача: статистика, превью, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   H70_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b "<папка модели>/_rev1/hydra70.blend" --factory-startup \
#       --python build.py --python bake.py --python deliver.py
# Чертежей-кадров для силуэтов в папке нет (ревизия 1 собрана по чертежам из интернета ранее) — форма не менялась, проверка силуэта не повторяется.
# H70_REUSE=1 — цвет не запекать заново (геометрия та же — развёртка та же), пересчитать только нормали и сдачу.
import os, sys, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и собрал сцену H70

OUT = os.environ.get('H70_OUT')
if not OUT: raise SystemExit('Задай H70_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
sc = bpy.data.scenes['H70']
st = mk.stats()

# превью для Sketchfab и для Mark (общий, сбоку, хвост, голова) — уже с текстурой и нормалями
prev = [os.path.basename(p) for p in mk.previews(OUT)]

# сдача: файл для Sketchfab — с полными текстурами (1024); игровой файл и .blend — с облегчёнными (256: цвет JPEG, нормали PNG)
mk.export(OUT + '/hydra70_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + '/hydra70_detail_256.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + '/hydra70_normal_256.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('H70_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'H70_normal' else lc
mk.export(OUT + '/hydra70.glb', OUT + '/hydra70.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_nar_hydra', weapon='hydra', name='Hydra 70', name_en='Hydra 70', glb='hydra70.glb', blend='hydra70.blend', rev=2,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Hydra 70 (2.75" FFAR) Rocket — Low Poly, Textured',
               'lead': 'Hydra 70 — 70 mm (2.75") unguided air-to-ground rocket with the Mk 66 motor, WAFAR wrap-around fins and an M151 HE warhead (olive drab with yellow band). Hand-modelled low-poly exterior with baked paint wear, exhaust soot and a normal map.',
               'parts': ['fuze', 'warhead with yellow band', 'joint ring', 'Mk 66 motor tube', 'tail ring', 'nozzle', '3 curved fins with hinges'],
               'tags': ['hydra70', 'rocket', 'ffar', 'missile', 'military', 'weapon', 'helicopter', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': 'length 1.45 m, diameter 70 mm',
               'textures': '1024 px baked colour map and tangent-space normal map',
               'glb': 'hydra70_sketchfab.glb'},
    notes='Ревизия 2 (2026-10-22, текстуры по образцу Х-29Т и С-8): форма ревизии 1 без изменений; добавлены текстура цвета (затенение стыков, потёки вдоль корпуса, нагар у сопла и на оперении, потёртости на кромках) и карта нормалей (скруглённые кромки, зерно краски). '
          'Надписей и маркировки нет — надёжного источника нет. Для игры — 256 (hydra70.glb), для Sketchfab — 1024 (hydra70_sketchfab.glb). Нос в −Z осей glTF.')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = 256; pj['nTex'] = 256
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
