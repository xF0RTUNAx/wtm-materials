# Х-31П — проверка и сдача (ревизия 2 — с текстурами и нормалями; bake.py запускается между build.py и этим файлом): силуэты в кадрах чертежей, статистика, превью, экспорт, паспорт. Запускается ПОСЛЕ build.py в том же Blender:
#   K31_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#       --python <папка>/build.py --python <папка>/deliver.py
# Дальше — в терминале (K=…/own/_kit, F="<папка модели>"):
#   /usr/bin/python3 -I $K/compare.py "$F/чертёж-спереди.png" "$F/проверка-чертежей/m_спереди.png" "$F/проверка-чертежей/наложение_спереди.png" 3 --passport "$F/ПАСПОРТ.json" --view спереди
#   /usr/bin/python3 -I $K/compare.py "$F/чертёж-сзади.png"   "$F/проверка-чертежей/m_сзади.png"   "$F/проверка-чертежей/наложение_сзади.png"   3 --passport "$F/ПАСПОРТ.json" --view сзади
# Бок: вид-сверху-размеры.png — перспективный рендер (и заборники у него расположены иначе), IoU для него не годится — только наложение на глаз.
#   /usr/bin/python3 -I $K/compare.py "$F/вид-сверху-размеры.png" "$F/проверка-чертежей/m_бок.png" "$F/проверка-чертежей/наложение_бок.png" 2
import os, sys, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель

OUT = os.environ.get('K31_OUT')
if not OUT: raise SystemExit('Задай K31_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
sc = bpy.data.scenes['KH31P']
st = mk.stats()

# вид-сверху-размеры.png — 532 × 375, нос слева; чертёж-спереди.png — 150 × 150, ось в (75, 75), радиус корпуса 25 пикс.; чертёж-сзади.png — 124 × 150, ось (75, 75)
mk.silhouette_side(CHK + '/m_бок.png', (532, 375), (532 / 2, 375 / 2))
mk.silhouette_end(CHK + '/m_спереди.png', (150, 150), axis_px=(75, 75), rear=False, rb_px=25.0)
mk.silhouette_end(CHK + '/m_сзади.png', (124, 150), axis_px=(75, 75), rear=True, rb_px=25.0)

# превью для Sketchfab и для Mark — уже с текстурой и нормалями
prev = [os.path.basename(p) for p in mk.previews(OUT)]

# сдача: файл для Sketchfab — с полными текстурами; игровой файл и .blend — с облегчёнными (512: цвет JPEG, нормали PNG)
mk.export(OUT + '/kh31p_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + '/kh31p_detail_512.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + '/kh31p_normal_512.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K31_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K31_normal' else lc
mk.export(OUT + '/kh31p.glb', OUT + '/kh31p.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_kh31p', weapon='kh31p', name='Х-31П', name_en='Kh-31P', glb='kh31p.glb', blend='kh31p.blend', rev=2,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Kh-31P Air-to-Surface Missile — Low Poly, Textured',
               'lead': 'Kh-31P — Soviet/Russian anti-radiation air-to-surface missile with a pointed ogive nose, four ramjet air intakes and four cruciform swept wings with control plates. Hand-modelled low-poly exterior with baked paint wear, exhaust soot, a stencilled serial number and a normal map.',
               'parts': ['pointed ogive nose with panel seams', 'cylindrical body with joints', 'four ramjet air intakes with connecting webs', 'four swept cruciform wings', 'four control plates', 'access hatch and sockets', 'suspension lugs', 'nozzle bowl'],
               'tags': ['kh-31', 'kh31', 'missile', 'air-to-surface', 'anti-radiation', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'textures': '1024 px baked colour map and tangent-space normal map',
               'glb': 'kh31p_sketchfab.glb'},
    notes='Ревизия 2 (2026-10-22, текстуры по образцу Х-29Т): цвет светлый серо-белый, как в ревизии 1; добавлены текстура цвета (затенение стыков, потёки вдоль корпуса, нагар у сопла и заборников, потёртости на кромках, трафаретный номер на бортах) и карта нормалей '
          '(скруглённые кромки, зерно краски). Для игры — 512 (kh31p.glb), для Sketchfab — 1024 (kh31p_sketchfab.glb). Заборники и оперение крестом × по чертежу (на рендере с размерами они расположены +, но чертёж — главный). '
          'Длинные станции взяты с рендера (чертёж обрезан), радиусы и форма крыла — с чертежа. Нос в −Z осей glTF.')
# размеры текстур для prepare.js (integrate-own.js берёт их из паспорта)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = 512; pj['nTex'] = 512
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
