# GBU-57 — проверка и сдача: силуэт в кадре чертежа, статистика, превью, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   G57_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Дальше в терминале (системный Python с Pillow) — наложение силуэта на чертёж, число само запишется в отчёт:
#   K=/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/_kit ; F="<папка модели>"
#   /usr/bin/python3 -I $K/compare.py "$F/_измерения/1_только_бомба.png" "$F/проверка-чертежей/m_бок.png" "$F/проверка-чертежей/наложение_бок.png" 2 --report "$F/ОТЧЁТ.json" --view бок
# Уровень 2 (игра, без записи в репозиторий), потом итог словами в отчёт:
#   deno run -A /Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/preview-candidate.js w_gbu57 "$F/gbu57.glb" --out "$F/превью-игра" --tex 1024 --ntex 512 --weapon gbu57
#   /usr/bin/python3 -I $K/passport_set.py "$F/ОТЧЁТ.json" checks.game "<что видно>"
# Последний шаг, после «принимаю» от Mark: deno run -A …/tools/airdef-models/sketchfab-pack.js "$F"
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk                                   # build.py уже подключил библиотеку и собрал сцену GBU57

OUT = os.environ.get('G57_OUT')
if not OUT: raise SystemExit('Задай G57_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
GAME_TEX, GAME_NTEX = int(os.environ.get('G57_GAME_TEX', '1024')), int(os.environ.get('G57_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('G57_TEX', '2048'))
sc = bpy.data.scenes['GBU57']
st = mk.stats()

# уровень 1: силуэт сбоку в кадре картинки _измерения/1_только_бомба.png (630 × 176, нос слева, ось на y = 85)
mk.silhouette_side(CHK + '/m_бок.png', (630, 176), (630 / 2, 176 / 2))

# превью для Sketchfab и для Mark: общий, сбоку, хвост (решётчатые рули, стакан), голова (оживало, пояс) — уже с текстурой и нормалями
L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.75, 0.85, 0.5), 1.5 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.4 * L),
    ('превью_3_хвост.png', Vector((0.0, -2.55, 0.0)), (0.85, -1.0, 0.55), 4.0),
    ('превью_4_голова.png', Vector((0.0, 1.95, 0.0)), (-0.85, 0.9, 0.35), 3.4)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('рули_и_стакан.png', Vector((0.0, -2.9, 0.0)), (0.9, -0.55, 0.55), 1.9),
    ('крыло_корень.png', Vector((0.0, -1.0, 0.3)), (-0.6, -0.35, 0.8), 1.6),
    ('нос_и_пояс.png', Vector((0.0, 2.1, 0.0)), (-0.9, 0.35, 0.25), 1.5)])

# сдача: файл для Sketchfab — с полными текстурами; игровой файл и .blend — с облегчёнными (цвет JPEG, нормали PNG)
mk.export(OUT + '/gbu57_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/gbu57_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/gbu57_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('G57_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'G57_normal' else lc
mk.export(OUT + '/gbu57.glb', OUT + '/gbu57.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_gbu57', weapon='gbu57', name='GBU-57', name_en='GBU-57', glb='gbu57.glb', blend='gbu57.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'GBU-57 MOP Bunker Buster Bomb — Low Poly, Textured',
               'lead': 'GBU-57 — US GPS-guided bunker-buster bomb (Massive Ordnance Penetrator) with an ogive nose and blue band, four swept stabilizer strakes and four deployed lattice grid fins on an open tail shroud. Hand-modelled low-poly exterior with baked paint wear, rows of rivets and a normal map.',
               'parts': ['fuze', 'ogive nose with blue band', 'steel casing with joint seams', 'four swept stabilizer strakes', 'open tail shroud with hub and star arms', 'four lattice grid fins with hinges'],
               'tags': ['gbu-57', 'gbu57', 'mop', 'bomb', 'bunker buster', 'massive ordnance penetrator', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f"length {st['length_m']:.1f} m, body diameter {2 * mk.RB * mk.S:.2f} m, grid fin span {st['span_m']:.2f} m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'gbu57_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-22): по чертежу 1.png (бок, рули на вставке), инфографике 2.png (пропорции) и 3D-рендеру 3.webp (только детали хвоста и рядов заклёпок — меши свои). Длина 6,31 м — как у прежней модели в игре. '
          'Крылья-стрейки крестом ×, решётчатые рули в «плюс» ⟂ оси (развёрнуты), хвостовой стакан открытый, оживало с синим поясом и взрывателем. Надписей («BOEING», серийный номер на рендере) нет: на чертеже их нет. '
          f'Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Решётка рулей — геометрия (плоский материал G57_lattice без текстуры). Нос в −Z осей glTF, бомба в отсеке B-2.')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
