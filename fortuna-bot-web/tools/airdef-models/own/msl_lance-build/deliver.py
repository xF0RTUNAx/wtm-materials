# MGM-52 Lance — проверка и сдача: статистика, превью, крупные планы, экспорт, паспорт. Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   LNC_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Силуэт по чертежу не сверяется: у модели нет ортогональных видов (только фото в перспективе — проверка по наложению на фото, см. notes).
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('LNC_OUT')
if not OUT: raise SystemExit('Задай LNC_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('LNC_GAME_TEX', '512')), int(os.environ.get('LNC_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('LNC_TEX', '2048'))
BASE = 'msl_lance'
sc = bpy.data.scenes['MGM52']
st = mk.stats()
L = st['length_m']; c = Vector((0.0, 0.0, 0.0))

if bpy.data.objects.get('MGM52_sun') is None:
    sd = bpy.data.lights.new('MGM52_sun', 'SUN'); so = bpy.data.objects.new('MGM52_sun', sd); mk.col.objects.link(so)
bpy.data.objects['MGM52_sun'].data.angle = 0.12
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.62, 0.80, 0.42), 1.62 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.50 * L),
    ('превью_3_хвост.png', Vector((0.0, -2.3, 0.0)), (0.85, -1.0, 0.42), 3.7),
    ('превью_4_голова.png', Vector((0.0, 2.2, 0.0)), (-0.85, 0.9, 0.35), 3.5)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('оперение.png', Vector((0.0, -2.6, 0.0)), (0.9, -0.5, 0.45), 2.6),
    ('сопло.png', Vector((0.0, -3.0, 0.0)), (0.35, -1.0, 0.18), 2.0),
    ('трафарет_USAARMY.png', Vector((0.0, -0.3, 0.0)), (-1.0, 0.0, 0.05), 1.7),
    ('стык_винты.png', Vector((0.0, 1.8, 0.0)), (-0.9, 0.55, 0.25), 1.7),
    ('нос_заплатки.png', Vector((0.0, 2.0, 0.0)), (-1.0, 0.1, 0.1), 2.8),
    ('короб_кабельный.png', Vector((0.0, -0.8, 0.28)), (0.55, 0.25, 1.0), 2.8)])

mk.export(OUT + f'/{BASE}_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/{BASE}_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/{BASE}_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('LNC_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'LNC_normal' else lc
mk.export(OUT + f'/{BASE}.glb', OUT + f'/{BASE}.blend')

dims = f"length {st['length_m']:.2f} m, body diameter 0.62 m, fin span {st['span_m']:.2f} m"
mk.passport(OUT + '/ПАСПОРТ.json', key='msl_lance', weapon='', name='MGM-52 Lance (ракета)', name_en='MGM-52 Lance Missile', glb=f'{BASE}.glb', blend=f'{BASE}.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py', 'lnc_sheet.py'], previews_=prev,
    sketchfab={'title': 'MGM-52 Lance Missile (Low Poly, Textured)',
               'lead': 'MGM-52 Lance tactical ballistic missile of the US Army: olive drab body with a lighter tangent-ogive nose, four large cropped-delta tail fins in a plus layout, a straight full-diameter tail with an open nozzle, a cable duct along the body, seam grooves and screw rings, stencils and baked paint wear.',
               'parts': ['tangent-ogive nose with a lighter nose section', 'cylindrical body with seam grooves and a cable duct', 'four tail fins in a plus layout with marking bars', 'open nozzle in the flat tail', 'baked colour map and tangent normal map'],
               'tags': ['lance', 'mgm-52', 'missile', 'ballistic', 'tactical', 'us army', 'usa', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': dims,
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': f'{BASE}_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-25): по картинкам Mark (Свои/MGM-52/): 1 — пуск (ракета поднята на M752, вид снизу-сзади: хвост, оперение «+», сопло), 2 — белая ракета стоит (макет), 3 — ракета лёжа на M752 (музей: светлее нос, «U.S. ARMY», швы), '
          '4 — ч/б снимок на прицепной пусковой (профиль: оживало, цилиндр, швы-полосы; повёрнут до горизонтали и измерен), 5 — рисунок M752 (только пусковая). Размеры: ПРЕДПОЛОЖЕНИЕ — длина 6,17 м, Ø 0,62 м (на картинках масштаба нет, прежней модели в игре нет); '
          'по слову Mark «ракета толще, без сужения в конце»: Ø увеличен с 0,55 до 0,62 м, хвост — цилиндр полного диаметра до плоского торца с соплом. Оси: нос +Y (в glTF −Z), начало — середина длины, ось — Y; оперение «+» (картинки 1, 2, 4). '
          'Профиль снят с ч/б снимка и проверен наложением (радиусы станций оживала по касательной с длиной 0,33 L). IoU по чертежу не считается (чертежей нет). В игре её ещё нет: ключ msl_lance, оружие — по решению основного чата.')
print('сдача готова:', OUT)
