# Mk 82 - проверка и сдача: силуэт в кадре снимка сбоку, статистика, превью, экспорт, паспорт и отчёт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   M82_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Наложение: проверка-чертежей/m_бок_ref2.png на _измерения/ref2_ось.png (референс_2, повёрнутый осью по горизонтали): /usr/bin/python3 -I _kit/compare.py
# Уровень 2 (игра, без записи в репозиторий):
#   deno run -A /Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/preview-candidate.js w_mk82 "$F/mk82.glb" --out "$F/превью-игра" --tex 1024 --ntex 512 --weapon mk82
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('M82_OUT')
if not OUT: raise SystemExit('Задай M82_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
CHK = OUT + '/проверка-чертежей'
GAME_TEX, GAME_NTEX = int(os.environ.get('M82_GAME_TEX', '1024')), int(os.environ.get('M82_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('M82_TEX', '2048'))
sc = bpy.data.scenes['MK82']
st = mk.stats()
G = mk.GEO

# уровень 1: силуэт сбоку в кадре _измерения/ref2_ось.png (1984 × 314, нос слева, перья стоят крестом ×, как на снимке)
mk.silhouette_side(CHK + '/m_бок_ref2.png', (1984, 314), (992.0, 157.0))

L = st['length_m']
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', Vector((0, 0.10, -0.02)), (-0.74, 0.62, 0.30), 3.35),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.10), 3.3),
    ('превью_3_хвост.png', Vector((0.0, -0.92, 0.0)), (-0.62, -0.62, 0.48), 1.05),
    ('превью_4_голова.png', Vector((0.0, 0.92, 0.0)), (-0.70, 0.62, 0.34), 0.9)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('упоры_и_тросик.png', Vector((0, 0.22, 0.13)), (-0.62, 0.42, 0.65), 0.95),
    ('взрыватель.png', Vector((0, 1.03, 0.0)), (-0.70, 0.62, 0.34), 0.60),
    ('надписи_борт_минус_X.png', Vector((0, 0.0, 0.0)), (-1.0, 0.0, 0.10), 1.3),
    ('надписи_борт_плюс_X.png', Vector((0, 0.0, 0.0)), (1.0, 0.0, 0.10), 1.3),
    ('поясок_и_лючок.png', Vector((0, -0.55, 0.0)), (-0.9, -0.25, 0.30), 0.95)])

mk.export(OUT + '/mk82_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/mk82_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/mk82_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('M82_') and m.node_tree]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'M82_normal' else lc
mk.export(OUT + '/mk82.glb', OUT + '/mk82.blend')
span = 2 * G['R_FIN'] * mk.S
mk.passport(OUT + '/ПАСПОРТ.json', key='w_mk82', weapon='mk82', name='Mk 82', name_en='Mk 82', glb='mk82.glb', blend='mk82.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Mk 82 500 lb Bomb - Textured',
               'lead': 'Mk 82 - American 500 lb general purpose bomb with a nose fuze. Olive drab body, yellow nose band, yellow stencil markings, conical tail with four cruciform fins, two suspension lugs and an arming wire. Own mesh and own baked paint with light wear.',
               'parts': ['olive body with a joint band', 'yellow nose band', 'nose fuze with ribbed dome and brass tabs', 'two suspension lugs', 'filling port cover', 'arming wire with ring, link and sleeve', 'four fixed tail fins'],
               'tags': ['mk82', 'mk-82', 'bomb', 'aviation bomb', 'american', 'military', 'weapon', 'aircraft', 'game-ready', 'textured', 'blender'],
               'dimensions': f"length {st['length_m']:.2f} m, body diameter {2 * mk.RB * mk.S:.2f} m, fin span tip to tip {span:.2f} m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'mk82_sketchfab.glb'},
    notes='Ревизия 1 (2026-11-04): по двум картинкам Mark. Форма - по снимку сбоку, повёрнутому осью по горизонтали, сверена с музейным фото; цвет и лёгкий износ - по музейному фото; надписи свои, образец - светлый снимок. '
          f'Длина 2,30 м вместе с взрывателем (по прежней модели), Ø корпуса {2 * mk.RB * mk.S:.3f} м. Перья крестом × к упорам. Подвижных частей нет. Тросик - плоский материал без текстуры, радиус {G["R_WIRE"] * mk.S * 1000:.1f} мм. '
          f'Для игры цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab {SKETCH_TEX}. Нос в -Z осей glTF, упоры вверх (+Y glTF), начало на оси, середина длины.')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
